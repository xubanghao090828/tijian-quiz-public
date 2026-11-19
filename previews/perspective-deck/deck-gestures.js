import { springAt } from './perspective-deck.js?v=pick4';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

/** Independent input adapter: Pointer Events -> deck timeline. No framework. */
export class DeckGestures extends EventTarget {
  constructor(deck) {
    super(); this.deck=deck;this.root=deck.root;this.stroke=null;this.frame=0;this.offset=0;this.offsetAnimation=null;this.dead=false;
    this.abort=new AbortController();const signal=this.abort.signal;
    this.root.classList.add('pcd-gestures');this.root.tabIndex=0;this.root.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown');
    this.root.addEventListener('pointerdown',event=>this.down(event),{signal});
    this.root.addEventListener('pointermove',event=>this.move(event),{signal,passive:false});
    this.root.addEventListener('pointerup',event=>this.up(event),{signal});
    this.root.addEventListener('pointercancel',()=>this.cancel(),{signal});
    this.root.addEventListener('lostpointercapture',event=>{if(event.target===this.root)this.cancel()},{signal});
    document.addEventListener('pointerdown',event=>{if(this.stroke&&event.pointerId!==this.stroke.id)this.cancel()},{signal,capture:true});
    window.addEventListener('blur',()=>this.cancel(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel()},{signal});
    this.root.addEventListener('keydown',event=>{
      if(event.target.closest('input,button,select,textarea,a')||!['ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();this.dispatchEvent(new Event('intent'));this.deck.shuffle(event.key==='ArrowUp'?1:-1);
    },{signal});
    this.root.addEventListener('click',event=>{if(performance.now()<(this.suppressClickUntil||0)){event.preventDefault();event.stopImmediatePropagation()}},{signal,capture:true});
  }
  down(event){
    const pick=event.target.closest('.pcd-pick');
    if(!event.isPrimary||event.button!==0||!pick&&!event.target.closest('.pcd-plane')||!pick&&event.target.closest('button,input,select,textarea,a'))return;
    this.suppressClickUntil=0;
    this.cancel();
    if(this.offsetAnimation){this.offset=new DOMMatrixReadOnly(getComputedStyle(this.deck.plane).transform).m42;this.offsetAnimation.cancel();this.offsetAnimation=null;this.deck.plane.style.transform=`translate3d(0,${this.offset}px,0)`;}
    this.stroke={id:event.pointerId,x:event.clientX,y:event.clientY,lastY:event.clientY,points:[{y:event.clientY,t:event.timeStamp}],direction:0,active:false,preview:false,baseOffset:this.offset};
  }
  move(event){
    const s=this.stroke;if(!s||s.id!==event.pointerId)return;
    const dx=event.clientX-s.x,dy=event.clientY-s.y;
    if(!s.active){
      if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.15){this.stroke=null;this.suppressClickUntil=performance.now()+400;return;}
      if(Math.abs(dy)<8||Math.abs(dy)<Math.abs(dx)*1.15)return;
      s.active=true;s.direction=dy<0?1:-1;this.root.setPointerCapture(event.pointerId);this.root.classList.add('is-dragging');this.dispatchEvent(new Event('intent'));
    }
    if(event.cancelable)event.preventDefault();s.lastY=event.clientY;s.points.push({y:event.clientY,t:event.timeStamp});s.points=s.points.filter(p=>event.timeStamp-p.t<=100).slice(-12);
    if(!this.frame)this.frame=requestAnimationFrame(()=>this.draw());
  }
  draw(){
    this.frame=0;const s=this.stroke;if(!s?.active)return;
    const dy=s.lastY-s.y,distance=dy*(s.direction>0?-1:1),span=Math.max(100,this.deck.height*.65);
    // The full-size front card needs less timeline travel to stay under a downward finger.
    s.preview=this.deck.drag(s.direction,clamp(distance/span,0,1)*(s.direction>0?.28:.20));
    this.offset=this.deck.reducedMotion.matches?0:s.baseOffset+clamp(dy*.18,-32,32);
    this.deck.plane.style.transform=`translate3d(0,${this.offset}px,0)`;
  }
  up(event){
    const s=this.stroke;if(!s||s.id!==event.pointerId)return;
    if(!s.active){this.stroke=null;return;}
    s.lastY=event.clientY;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.draw();
    const distance=(s.lastY-s.y)*(s.direction>0?-1:1),recent=s.points.find(p=>event.timeStamp-p.t<=80)||s.points.at(-1);
    const velocity=recent&&event.timeStamp-recent.t>0?(s.lastY-recent.y)/(event.timeStamp-recent.t)*(s.direction>0?-1:1):0;
    const threshold=clamp(this.deck.height*.3,44,80),projection=distance+clamp(velocity,-1.5,1.5)*100;
    const commit=distance>=18&&(distance>=threshold&&velocity>-.35||velocity>=.5||projection>=threshold+20);
    this.stroke=null;this.suppressClickUntil=performance.now()+400;this.root.classList.remove('is-dragging');
    if(this.root.hasPointerCapture(s.id))this.root.releasePointerCapture(s.id);
    if(s.preview)this.deck.releaseDrag(commit,velocity);
    else if(commit){if(this.deck.snapshot().paused)this.deck.resume();this.deck.shuffle(s.direction);}
    this.settleOffset();this.dispatchEvent(new CustomEvent('release',{detail:{commit,direction:s.direction,distance,velocity}}));
  }
  settleOffset(){
    const from=this.offset;if(this.offsetAnimation)this.offsetAnimation.cancel();this.offsetAnimation=null;
    this.offset=0;this.deck.plane.style.transform='translate3d(0,0,0)';
    if(!from||this.deck.dead||this.deck.reducedMotion.matches)return;
    const frames=Array.from({length:49},(_,i)=>({offset:i/48,transform:`translate3d(0,${from*(1-springAt(i/48,.45))}px,0)`}));
    const animation=this.deck.plane.animate(frames,{duration:300,fill:'both'});this.offsetAnimation=animation;
    animation.finished.then(()=>{if(this.offsetAnimation===animation){animation.cancel();this.offsetAnimation=null}}).catch(()=>{});
  }
  cancel(){
    const s=this.stroke;this.stroke=null;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;
    if(s?.preview)this.deck.releaseDrag(false);
    if(s&&this.root.hasPointerCapture(s.id))this.root.releasePointerCapture(s.id);
    this.root.classList.remove('is-dragging');if(s?.active)this.settleOffset();
  }
  destroy(){if(this.dead)return;this.dead=true;this.cancel();this.abort.abort();this.offsetAnimation?.cancel();this.deck.plane.style.transform='';this.root.classList.remove('pcd-gestures','is-dragging');}
}
