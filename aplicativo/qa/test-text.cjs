const assert = require('node:assert/strict');
const {splitText} = require('../public/text-utils');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const normalize = text => text.replace(/\s+/gu,' ').trim();
assert.deepEqual(splitText(''),[]);
assert.deepEqual(splitText('Olá, tudo bem?'),['Olá, tudo bem?']);
assert.deepEqual(splitText('Uma frase. Outra frase!\nPergunta?'),['Uma frase.','Outra frase!','Pergunta?']);
const long = Array.from({length:100},(_,i)=>`palavra${i}`).join(' ');
for (const text of [long, long.replaceAll(' ', ', '), readFileSync(join(__dirname,'../public/texto-vida.txt'),'utf8')]) {
  const parts = splitText(text);
  assert.equal(normalize(parts.join(' ')),normalize(text),'Nenhuma palavra ou pontuação pode desaparecer ou ser repetida.');
  assert.ok(parts.every(part=>part.length<=220));
}
assert.deepEqual(splitText('O valor é 1.500 reais. Tudo bem?'),['O valor é 1.500 reais.','Tudo bem?']);
console.log('Divisao em trechos: frases, listas, texto longo, numeros e preservacao de conteudo OK.');
