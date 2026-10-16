(function(root) {
  'use strict';
  const STATES = ['pending', 'translating', 'done', 'error', 'cancelled'];
  class Session {
    constructor() { this.text = ''; this.split = true; this.segments = []; this.busy = false; this.run = 0; this.controller = null; }
    prepare(text, split, splitter) {
      this.cancel(); this.text = text.trim(); this.split = split;
      this.segments = (split ? splitter(this.text) : this.text ? [this.text] : []).map(original => ({original, text:original, gloss:'', state:'pending', error:null}));
    }
    edit(index, text) {
      if (this.busy) return false;
      const segment = this.segments[index];
      if (!segment || this.segments.reduce((n,s,i)=>n+(i===index?text.length:s.text.length),0)>5000) return false;
      segment.text = text; segment.gloss = ''; segment.state = 'pending'; segment.error = null;
      return true;
    }
    complete() { return this.segments.length>0 && this.segments.every(s=>s.state==='done' && s.gloss); }
    fullGloss() { return this.complete() ? this.segments.map(s=>s.gloss).join(' ') : ''; }
    cancel() {
      this.run++; this.controller?.abort(); this.controller=null; this.busy=false;
      this.segments.forEach(s=>{if(s.state==='translating')s.state='cancelled';});
    }
    async translate(request, changed, onlyIndex=null) {
      if(this.busy) return;
      const targets=this.segments.map((s,i)=>i).filter(i=>(onlyIndex===null? this.segments[i].state!=='done'||!this.segments[i].gloss : i===onlyIndex));
      if(!targets.length) return;
      const token=++this.run; this.busy=true;
      try {
        for(const index of targets) {
          if(token!==this.run) return;
          const segment=this.segments[index];
          if(!segment.text.trim()) { segment.state='error'; segment.error={code:'INVALID_REQUEST',error:'Escreva o texto deste trecho.',retryable:false}; changed(); return; }
          segment.state='translating'; segment.gloss=''; segment.error=null; this.controller=new AbortController(); changed();
          const controller=this.controller;
          const timer=setTimeout(()=>controller.abort(),35000);
          try {
            const result=await request(segment.text,controller.signal);
            if(token!==this.run) return;
            if(typeof result.gloss!=='string'||!result.gloss.trim()) throw Object.assign(new Error('O tradutor retornou uma resposta inválida.'),{code:'INVALID_RESPONSE',retryable:true});
            segment.gloss=result.gloss; segment.state='done';
          } catch(error) {
            if(token!==this.run) return;
            segment.state='error'; segment.error={error:error.name==='AbortError'?'O tradutor demorou a responder.':error.message,code:error.name==='AbortError'?'TIMEOUT':error.code||'CONNECTION_ERROR',retryable:error.retryable!==false};
            return;
          } finally { clearTimeout(timer); if(token===this.run) {this.controller=null;changed();} }
        }
      } finally {if(token===this.run){this.busy=false;changed();}}
    }
    snapshot(inputText=this.text,inputSplit=this.split) {
      return {version:1,inputText,inputSplit,text:this.text,split:this.split,segments:this.segments.map(s=>({...s,state:s.state==='translating'?'cancelled':s.state}))};
    }
    restore(data) {
      const str=(value)=>typeof value==='string'&&value.length<=5000;
      if(!data||data.version!==1||!str(data.text)||!str(data.inputText)||typeof data.split!=='boolean'||!Array.isArray(data.segments)||data.segments.length>5000) throw new Error('Sessão salva inválida ou incompatível.');
      if(data.inputSplit!==undefined&&typeof data.inputSplit!=='boolean')throw new Error('Opção de divisão inválida.');
      let size=0, originalSize=0;
      const segments=data.segments.map(s=>{
        if(!s||!str(s.original)||!str(s.text)||typeof s.gloss!=='string'||s.gloss.length>100000||!STATES.includes(s.state)) throw new Error('Trecho salvo inválido.');
        if(s.state==='done'&&!s.gloss.trim())throw new Error('Tradução salva vazia.');
        size+=s.text.length;originalSize+=s.original.length;
        return {original:s.original,text:s.text,gloss:s.state==='done'?s.gloss:'',state:s.state==='translating'?'cancelled':s.state,error:null};
      });
      if(size>5000||originalSize>5000) throw new Error('Sessão salva excede o limite.');
      this.cancel();this.text=data.text;this.split=data.split;this.segments=segments;
      return data.inputText;
    }
  }
  const KEY='texto-em-libras-session-v1';
  function load(storage) { const raw=storage.getItem(KEY); if(!raw)return null; if(raw.length>2000000)throw new Error('Sessão salva muito grande.');const value=JSON.parse(raw);new Session().restore(value);return value; }
  const api={Session,KEY,load};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LibrasSession=api;
})(typeof window!=='undefined'?window:globalThis);
