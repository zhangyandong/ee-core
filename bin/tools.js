'use strict';

const codeCompress = require('../tools/codeCompress');
const replaceDist = require('../tools/replaceDist');

// argv
const args = process.argv;
//console.log('[ee-core] args:', args);
const cmd = args[2];
console.log('[ee-core] cmd:', cmd);

if (cmd == 'rd') {
  replaceDist.run();
}

if (cmd == 'compress') {
  codeCompress.compress();
}

if (cmd == 'restore') {
  codeCompress.restore();
}
