(function(){
  let media=null,modal=null,timer=null;
  function stop(){if(timer)clearTimeout(timer);timer=null;media?.getTracks().forEach(track=>track.stop());media=null;modal?.remove();modal=null}
  const decode=(canvas,image,width,height)=>{
    const ratio=Math.min(1,720/Math.max(width,height));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    return jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'})?.data;
  };
  async function start(onCode){
    stop();
    if(!navigator.mediaDevices?.getUserMedia)throw Error('当前环境无法直接打开相机，请使用“从二维码图片读取”或输入临时配对码。');
    modal=document.createElement('div');modal.className='qr-scanner-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','扫描配对二维码');
    modal.innerHTML='<p>将另一台设备的配对二维码放入画面</p><video playsinline muted></video><p data-camera-status>正在打开相机…</p><button class="secondary" type="button">取消扫码</button>';
    document.body.appendChild(modal);modal.querySelector('button').onclick=stop;
    const active=modal,video=modal.querySelector('video');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:720}},audio:false});
      if(modal!==active){stream.getTracks().forEach(track=>track.stop());return}
      media=stream;video.srcObject=stream;await video.play();modal.querySelector('[data-camera-status]').textContent='识别后会自动填写，仍需原设备确认';
      const canvas=document.createElement('canvas');
      const frame=()=>{
        if(modal!==active)return;
        if(video.readyState>=2&&video.videoWidth){const code=decode(canvas,video,video.videoWidth,video.videoHeight);if(code){stop();onCode(code);return}}
        timer=setTimeout(frame,180);
      };frame();
    }catch(error){stop();throw Error('相机未能打开。请允许相机权限，或使用二维码图片、临时配对码。')}
  }
  function image(onCode){
    const input=document.createElement('input');input.type='file';input.accept='image/*';
    input.onchange=async()=>{
      if(!input.files?.[0])return;
      try{
        const bitmap=await createImageBitmap(input.files[0]);const code=decode(document.createElement('canvas'),bitmap,bitmap.width,bitmap.height);bitmap.close();
        if(!code){alert('没有识别到二维码，请使用清晰完整的二维码图片，或直接输入临时配对码。');return}onCode(code);
      }catch{alert('无法读取这张图片，请换一张图片或输入配对码。')}
    };input.click();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')stop()});
  window.TijianScanner={start,stop,image};
})();
