(function(root){
  'use strict';
  const ORIGIN='https://vlibras.gov.br';
  class Player {
    constructor(frame,changed){this.frame=frame;this.changed=changed;this.ready=false;this.state='idle';this.progress=0;this.gloss='';this.timer=null;this.acceptEvents=false;window.addEventListener('message',event=>this.receive(event));}
    send(method,params){if(this.ready)this.frame.contentWindow.postMessage({type:'unity',object:'PlayerManager',method,params},ORIGIN);}
    load(){clearTimeout(this.timer);this.ready=false;this.state='loading';this.progress=0;this.acceptEvents=false;this.frame.src=`${ORIGIN}/app/unity/index.html?v=7.12.2&retry=${Date.now()}`;this.timer=setTimeout(()=>this.fail('O avatar demorou a responder. Tente carregar novamente.'),120000);this.changed();}
    fail(message){clearTimeout(this.timer);this.ready=false;this.state='error';this.message=message;this.acceptEvents=false;this.changed();}
    play(gloss){if(!this.ready||!gloss)return;this.gloss=gloss;this.acceptEvents=true;this.state='loading-signs';this.send('playNow',gloss);this.changed();}
    stop(){this.acceptEvents=false;this.send('stopAll');this.state='stopped';this.gloss='';this.changed();}
    pause(){if(!this.gloss)return;const pause=this.state!=='paused';this.send('setPauseState',pause?1:0);this.state=pause?'paused':'playing';this.changed();}
    receive(event){
      if(event.origin!==ORIGIN||event.source!==this.frame.contentWindow||event.data?.type!=='unity_event')return;
      const {event:type,data}=event.data;
      if(type==='update_progress'){const n=Number(data);if(Number.isFinite(n))this.progress=Math.max(0,Math.min(100,n*100));}
      else if(type==='on_load_player'){clearTimeout(this.timer);this.ready=true;this.state='idle';this.send('setBaseUrl','https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/');this.send('setSubtitlesState',1);}
      else if(type==='on_error')this.fail('Não foi possível iniciar o avatar. Confira a internet e o suporte a WebGL.');
      else if(this.acceptEvents&&type==='on_playing_state_change'&&Array.isArray(data)){
        const yes=n=>String(data[n]).toLowerCase()==='true';
        this.state=yes(3)?'loading-signs':yes(1)?'paused':yes(0)?'playing':'idle';
      }
      // O evento idle nao comprova que todos os sinais foram reproduzidos.
      this.changed();
    }
  }
  root.LibrasPlayer={Player};
})(window);
