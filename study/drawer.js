(function(root){
  'use strict';
  const dialog=document.querySelector('#study-entry-drawer');
  if(!dialog||!dialog.showModal)return;
  const drawer=dialog.querySelector('.study-drawer-panel'), dismiss=dialog.querySelector('[data-study-drawer-close]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let state='closed',origin=null,timer=0,sequence=0,gesture=null,quietClick=0;
  const hasMotion=()=>!reduced.matches&&document.documentElement.dataset.motion!=='off';
  function begin(button){
    if(state!=='closed'||!button?.isConnected)return;
    clearTimeout(timer);
    origin=button;quietClick=0;state='opening';const id=++sequence;
    button.setAttribute('aria-expanded','true');
    dialog.showModal();document.documentElement.classList.add('study-drawer-lock');
    dismiss.focus({preventScroll:true});
    if(hasMotion()){
      // Commit the off-screen pose before changing the transform target.
      drawer.getBoundingClientRect();
      requestAnimationFrame(()=>{if(id===sequence&&state==='opening'){dialog.classList.add('is-visible');state='open';}});
    }else{dialog.classList.add('is-visible');state='open';}
  }
  function finish(target){
    clearTimeout(timer);sequence++;gesture=null;quietClick=0;state='closed';
    document.documentElement.classList.remove('study-edge-drag');
    dialog.classList.remove('is-visible','is-dragging');drawer.style.removeProperty('--study-drag');
    if(dialog.open)dialog.close();
    document.documentElement.classList.remove('study-drawer-lock');
    const button=origin?.isConnected?origin:document.querySelector('[data-study-drawer-open]');
    button?.setAttribute('aria-expanded','false');origin=null;
    if(target){
      root.TijianStudy?.preparePanel(target);
      setView(target==='ai'?'short':target);
      requestAnimationFrame(()=>document.querySelector('[data-study-view]')?.focus({preventScroll:true}));
    }else button?.focus({preventScroll:true});
  }
  function close(target){
    if(state==='closed'||state==='closing')return false;
    const shouldAnimate=state==='open'&&hasMotion(),id=++sequence;
    state='closing';gesture=null;
    dialog.classList.remove('is-dragging');
    if(!shouldAnimate){finish(target);return true;}
    drawer.getBoundingClientRect();
    drawer.style.removeProperty('--study-drag');
    dialog.classList.remove('is-visible');
    // The fallback also covers interrupted transitions and reduced motion changes.
    timer=setTimeout(()=>{if(id===sequence)finish(target)},245);
    return true;
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-study-drawer-open]');
    if(button&&performance.now()>=quietClick)begin(button);
  });
  dialog.addEventListener('click',e=>{
    if(performance.now()<quietClick)return;
    const entry=e.target.closest('[data-study-drawer-target]');
    if(entry){close(entry.dataset.studyDrawerTarget);return;}
    if(e.target===dialog||e.target.closest('[data-study-drawer-close]'))close();
  });
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(state!=='closed'&&!dialog.open)finish();});
  const main=document.querySelector('.app-shell > .main');
  const handle=()=>document.querySelector('[data-study-drawer-open]');
  const formControl='input, select, textarea, [contenteditable]:not([contenteditable="false"]), .page-scrubber, .sequence-table-scroll';
  function start(e){
    if(!e.isPrimary||e.button!==0||gesture)return;
    quietClick=0;
    const target=e.target;
    if(target.closest('[data-study-drawer-close], '+formControl))return;
    const grip=target.closest('[data-study-drawer-grip]');
    const tab=target.closest('[data-study-drawer-open]');
    // Leave the outermost strip to the phone's system back gesture.
    const edge=state==='closed'&&document.body.dataset.view==='home'&&main?.contains(target)
      &&e.clientX>=32&&e.clientX<=Math.min(88,innerWidth*.24);
    if(grip?state!=='open':state!=='closed'||(!tab&&!edge))return;
    if(e.pointerType==='mouse'&&(grip||tab||target.closest('button, a')))return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,at:e.timeStamp,isOpen:!!grip,
      capture:grip||main,opener:tab||handle(),locked:false,width:drawer.clientWidth||320};
  }
  function move(e){
    const s=gesture;if(s?.id!==e.pointerId)return;
    if(!s.isOpen&&(state!=='closed'||document.body.dataset.view!=='home')){cancelGesture();return;}
    const dx=e.clientX-s.x,dy=e.clientY-s.y;
    if(!s.locked){
      if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){cancelGesture();return;}
      if((s.isOpen?-dx:dx)<10||Math.abs(dx)<1.35*Math.abs(dy))return;
      s.locked=true;
      if(s.capture?.isConnected)s.capture.setPointerCapture(e.pointerId);
      document.documentElement.classList.add('study-edge-drag');
      if(s.isOpen&&hasMotion())dialog.classList.add('is-dragging');
    }
    if(e.cancelable)e.preventDefault();
    if(s.isOpen&&hasMotion())drawer.style.setProperty('--study-drag',Math.max(-s.width,Math.min(0,dx))+'px');
  }
  function cancelGesture(){
    gesture=null;
    document.documentElement.classList.remove('study-edge-drag');
    dialog.classList.remove('is-dragging');
    drawer.style.removeProperty('--study-drag');
  }
  function end(e){
    const s=gesture;if(s?.id!==e.pointerId)return;
    if(e.type==='lostpointercapture'&&e.target!==s.capture)return;
    gesture=null;
    document.documentElement.classList.remove('study-edge-drag');
    if(!s.locked)return;
    const distance=(e.clientX-s.x)*(s.isOpen?-1:1),vertical=Math.abs(e.clientY-s.y);
    const commit=e.type==='pointerup'&&distance>vertical*1.25&&
      (distance>=Math.min(72,s.width*.23)||distance>=32&&distance/Math.max(1,e.timeStamp-s.at)>.45);
    if(commit&&s.isOpen){close();quietClick=performance.now()+350;return;}
    if(commit&&document.body.dataset.view==='home'){begin(s.opener?.isConnected?s.opener:handle());quietClick=performance.now()+350;return;}
    quietClick=performance.now()+350;
    dialog.classList.remove('is-dragging');drawer.getBoundingClientRect();drawer.style.removeProperty('--study-drag');
  }
  document.addEventListener('click',e=>{
    if(e.detail!==0&&performance.now()<quietClick){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.addEventListener('pointerdown',start);
  document.addEventListener('pointermove',move,{passive:false});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(event,end);
  window.addEventListener('blur',cancelGesture);
  root.TijianStudyDrawer={refresh(){document.querySelector('[data-study-drawer-open]')?.setAttribute('aria-expanded',String(dialog.open));},dismiss(){if(!dialog.open)return false;close();return true;}};
})(globalThis);
