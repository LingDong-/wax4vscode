// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { fstat } from 'fs';
import * as vscode from 'vscode';
const {exec} = require('child_process');
const {basename, dirname,extname} = require('path');
const fs = require('fs');

const EXITOK = `<h2 style="color:cyan">√</h2>`;
const EXITBAD = `<h2 style="color:pink">X</h2>`;
let panel:vscode.WebviewPanel|undefined = undefined;

let TARG = 'c';
let TMP = "/tmp/wax4vscode"

function get_cmds(targ:string,fname:string):any{
  let dname = dirname(fname);
  let bname = basename(fname);
  let mname = basename(fname,extname(fname));
  let cmd0 = `cd ${dname}; waxc ${bname} --${targ} ${TMP}/${mname}.${targ}`;
  let thing:Record<string,string[]> = {
    c:[
      cmd0,
      `cd ${TMP}; gcc ${mname}.c -o ${mname}`,
      `cd ${TMP}; time ./${mname}`,
    ],
    cpp:[
      cmd0,
      `cd ${TMP}; g++ ${mname}.cpp -o ${mname} -std=c++11`,
      `cd ${TMP}; time ./${mname}`,
    ],
    ts:[
      cmd0,
      `cd ${TMP}; tsc ${mname}.ts`,
      `cd ${TMP}; time node ${mname}.js`,
    ],
    java:[
      cmd0,
      `cd ${TMP}; javac ${mname}.java`,
      `cd ${TMP}; time java ${mname}`,
    ],
    lua:[
      cmd0,
      `cd ${TMP}; time luajit ${mname}.lua`,
    ],
    swift:[
      cmd0,
      `cd ${TMP}; swiftc ${mname}.swift`,
      `cd ${TMP}; time ./${mname}`
    ],
    cs:[
      cmd0,
      `cd ${TMP}; csc ${mname}.cs`,
      `cd ${TMP}; time mono ${mname}.exe`
    ],
    py:[
      cmd0,
      `cd ${TMP}; time python ${mname}.py`,
    ],
    wat:[
      cmd0,
      `cd ${TMP}; wat2wasm ${mname}.wat`,
      `cd ${TMP}; node -p "const fs = require('fs');
        var wasmpath = '${mname}.wasm';
        var _wax_mem={};
        function getStr(offset,length){
          var bytes = new Uint8Array(_wax_mem[wasmpath].buffer, offset, length);
          var str = new TextDecoder('utf8').decode(bytes);
          return str;
        };
        let imports = {
          console:{
            log : function(offset, length){
              console.log(getStr(offset,length));
            }
          },
          Math,
          debug:{logi32: function(x){console.log(x);}},
        };
        const buf = fs.readFileSync(wasmpath);
        WebAssembly.instantiate(new Uint8Array(buf),imports).then(results=>{
          let lib = results.instance.exports;
          _wax_mem[wasmpath] = lib.mem;
          lib.main();
      })"`.replace(/\n/gm,' ').replace(/ +/g," ")
    ]
  };
  console.log(thing[targ]);
  return thing[targ];
}

function render_cmd_out(cmd:string,stdout:string){
  stdout = stdout.replace(/\033\[0;31m/g,`<span style="color:pink">`)
  .replace(/\033\[0m/g,`</span>`).replace(/\n/g,"<br>")
  
  if (!(stdout.includes("<svg"))){
    stdout = stdout.replace(/ /g,"&nbsp;");
  }
  return `<b>$ ${cmd.replace(/;/g," \\<br>; ")}</b><br><br>${stdout}`
}

function strip_escseq(stdout:string){
  return stdout.replace(/\033\[0;31m/g,'').replace(/\033\[0m/g,``);
}

function runner(targ:string){
  let fname = vscode.window.activeTextEditor?.document.fileName;
  if (!fname){
    vscode.window.showWarningMessage("No active file to compile.");
    return;
  }
  let cmds = get_cmds(targ,fname);
  if (!panel){
    panel = vscode.window.createWebviewPanel(
      'waxc',
      'waxc',
      vscode.ViewColumn.Two,
      {}
    );
  }
  panel.webview.html = "<style>body{font-family:monospace;white-space:nowrap;}</style>"
  exec(cmds[0],(err:any, stdout:string, stderr:string) => {
    panel!.webview.html += render_cmd_out(cmds[0],stdout);
  }).on('exit',(code:number)=>{
    if (code == 0){
      panel!.webview.html += EXITOK;

      exec(cmds[1],(err:any, stdout:string, stderr:string) => {
        panel!.webview.html += render_cmd_out(cmds[1],stdout+"\n"+stderr);
      }).on('exit',(code:number)=>{
        if (code == 0){
          panel!.webview.html += EXITOK;
          if (!cmds[2]){
            return;
          }
          exec(cmds[2],(err:any, stdout:string, stderr:string) => {
            panel!.webview.html += render_cmd_out(cmds[2],stdout+"\n"+stderr);
          }).on('exit',(code:number)=>{
            if (code == 0){
              panel!.webview.html += EXITOK;
            }else{
              panel!.webview.html += EXITBAD;
            }
          })
        }else{
          panel!.webview.html += EXITBAD;
        }
      })
    }else{ 
      panel!.webview.html += EXITBAD;
    }
  });
}

function transpiler(targ:string){
  let fname = vscode.window.activeTextEditor?.document.fileName;
  let dname = dirname(fname);
  let bname = basename(fname);
  let mname = basename(fname,extname(fname));
  let cmd = `cd ${dname}; waxc ${bname} --${targ} ${TMP}/${mname}.${targ}`;
  let code = -1;
  exec(cmd,(err:any, stdout:string, stderr:string) => {
    if (code==0){
      vscode.workspace.openTextDocument(`${TMP}/${mname}.${targ}`).then(doc=>{
        vscode.window.showTextDocument(doc,vscode.ViewColumn.Two,true)
      })
    }else{
      let log = strip_escseq(stdout+"\n"+stderr);
      fs.writeFile(`${TMP}/${mname}.log`,log,(err:Error)=>{
        if (err){
          vscode.window.showWarningMessage("Compilation failed. Failed to create log file.");
        }else{
          vscode.workspace.openTextDocument(`${TMP}/${mname}.log`).then(doc=>{
            vscode.window.showTextDocument(doc,vscode.ViewColumn.Two,true)
          })
        }
      });
    }
  }).on('exit',(c:number)=>{
    code = c;
  });
}
function astprinter(targ:string){
  let fname = vscode.window.activeTextEditor?.document.fileName;
  let dname = dirname(fname);
  let bname = basename(fname);
  let mname = basename(fname,extname(fname));
  let cmd = `cd ${dname}; waxc ${bname} --${targ} ${TMP}${TMP}__${mname}.${targ} --silent --ast > ${TMP}/${mname}.ast.txt`;
  let code = -1;
  exec(cmd,(err:any, stdout:string, stderr:string) => {
    vscode.workspace.openTextDocument(`${TMP}/${mname}.ast.txt`).then(doc=>{
      vscode.window.showTextDocument(doc,vscode.ViewColumn.Two,true)
    })
  })
}

function linter(targ:string){
  let fname = vscode.window.activeTextEditor?.document.fileName;
  let dname = dirname(fname);
  let bname = basename(fname);
  let mname = basename(fname,extname(fname));
  let cmd = `cd ${dname}; waxc ${bname} --${targ} ${TMP}/${mname}.${targ} --silent`;
  let code = -1;
  exec(cmd,(err:any, stdout:string, stderr:string) => {
    if (code==0){
      vscode.window.setStatusBarMessage("[linter] looking good.",4000);
    }else{
      let log = strip_escseq(stdout+"\n"+stderr);
      log = (log.match(/\[.*? error\].*?\n/g)||[])[0] || log.split("\n")[0];
      vscode.window.setStatusBarMessage(log,4000);
    }
  }).on('exit',(c:number)=>{
    code = c;
  });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  exec(`mkdir ${TMP}`);
  context.subscriptions.push(vscode.commands.registerCommand('wax4vscode.run', () => {
    runner(TARG);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('wax4vscode.transpile', () => {
    transpiler(TARG);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('wax4vscode.settarg', ()=>{
    vscode.window.showQuickPick(["c",'cpp','cs','java','lua','py','swift','ts','wat'],
    {canPickMany:false}).then((targ:string|undefined)=>{
      if (targ){
        TARG = targ;
        vscode.window.setStatusBarMessage("target set: "+TARG,4000);
      }else{
        vscode.window.setStatusBarMessage("cancelled set target. (target remains to be: "+TARG+")",4000);
      }
    });
  }))
  context.subscriptions.push(vscode.commands.registerCommand('wax4vscode.ast', () => {
    astprinter(TARG);
  }));

  vscode.workspace.onDidSaveTextDocument(doc=>{
    linter(TARG);
  })
  


}


// this method is called when your extension is deactivated
export function deactivate() {
  exec(`rm -rf ${TMP}`);
}
