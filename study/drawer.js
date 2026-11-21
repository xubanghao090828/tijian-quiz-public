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
  const start=e=>{
    if(!e.isPrimary||e.pointerType==='mouse'||gesture)return;
    const grip=e.target.closest('[data-study-drawer-open], [data-study-drawer-grip]');
    if(!grip||e.target.closest('[data-study-drawer-close]'))return;
    const isOpen=grip.hasAttribute('data-study-drawer-grip');
    if(isOpen?state!=='open':state!=='closed')return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,at:e.timeStamp,isOpen,grip,locked:false,width:drawer.clientWidth||320};
  };
  function move(e){
    const s=gesture;if(s?.id!==e.pointerId)return;
    const dx=e.clientX-s.x,dy=e.clientY-s.y;
    if(!s.locked){
      if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
      if((s.isOpen?-dx:dx)<10||Math.abs(dx)<1.25*Math.abs(dy))return;
      s.locked=true;s.grip.setPointerCapture(e.pointerId);
      if(s.isOpen&&hasMotion())dialog.classList.add('is-dragging');
    }
    if(s.isOpen&&hasMotion())drawer.style.setProperty('--study-drag',Math.max(-s.width,Math.min(0,dx))+'px');
  }
  function end(e){
    const s=gesture;if(s?.id!==e.pointerId)return;
    if(e.type==='lostpointercapture'&&e.target!==s.grip)return;
    gesture=null;
    if(!s.locked)return;
    const distance=(e.clientX-s.x)*(s.isOpen?-1:1);
    const commit=e.type==='pointerup'&&(distance>=Math.min(84,s.width*.24)||distance>=30&&distance/Math.max(1,e.timeStamp-s.at)>.4);
    quietClick=performance.now()+350;
    if(commit&&s.isOpen){close();return;}
    if(commit){begin(s.grip);quietClick=performance.now()+350;return;}
    dialog.classList.remove('is-dragging');drawer.getBoundingClientRect();drawer.style.removeProperty('--study-drag');
  }
  document.addEventListener('pointerdown',start);
  document.addEventListener('pointermove',move);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(event,end);
  root.TijianStudyDrawer={refresh(){document.querySelector('[data-study-drawer-open]')?.setAttribute('aria-expanded',String(dialog.open));},dismiss(){if(!dialog.open)return false;close();return true;}};
})(globalThis);
