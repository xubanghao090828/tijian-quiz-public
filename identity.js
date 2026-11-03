(function(){
  const active='tijian-active-profile';
  let profile;try{profile=JSON.parse(localStorage.getItem(active))}catch{}
  if(!profile?.id||!profile?.secret){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const secret=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    profile={id:crypto.randomUUID(),secret,deviceId:crypto.randomUUID()};
    localStorage.setItem(active,JSON.stringify(profile));
    if(localStorage.getItem('tijian-v1'))localStorage.setItem('tijian-v1-'+profile.id,localStorage.getItem('tijian-v1'));
  }
  if(!profile.deviceId){profile.deviceId=crypto.randomUUID();localStorage.setItem(active,JSON.stringify(profile))}
  window.TIJIAN_PROFILE=profile;
  window.TIJIAN_STATE_KEY='tijian-v1-'+profile.id;
})();
