// ══════════════════════════════════════════════════════
// CUSTOM CONFIRM MODAL
// ══════════════════════════════════════════════════════
let _cfrmCb=null, _cfrmDanger=false;
function showConfirm(icon,title,msg,okLabel,cb){
  _cfrmCb=typeof cb==='function'?cb:null;
  document.getElementById('cfrmIcon').textContent=icon;
  document.getElementById('cfrmTitle').textContent=title;
  document.getElementById('cfrmMsg').textContent=msg;
  const okBtn=document.getElementById('cfrmOkBtn');
  const cancelBtn=okBtn.nextElementSibling;
  if(!okLabel){
    // Info-only dialog — hide danger button, relabel cancel
    okBtn.style.display='none';
    cancelBtn.textContent=typeof cb==='string'?cb:t('btn_understood');
    cancelBtn.className='cfrm-btn';
  } else {
    okBtn.style.display='';
    okBtn.textContent=okLabel;
    cancelBtn.textContent=t('btn_cancel');
    cancelBtn.className='cfrm-btn cancel';
  }
  // Not every confirmation is destructive (import, force-update, chat
  // memory), so remember whether to play the delete sound on OK.
  _cfrmDanger = !!okLabel && /удал|delete|сброс|reset|очист|clear/i.test(okLabel);
  document.getElementById('cfrmOv').classList.add('on');
  HFX.light(); SFX.play('sheet_open');
  lockScroll(true);
}
function cfrmConfirm(){
  document.getElementById('cfrmOv').classList.remove('on');
  lockScroll(false);
  HFX.heavy();SFX.play(_cfrmDanger?'delete':'save');
  const cb=_cfrmCb;
  _cfrmCb=null;
  if(cb)cb();
}
function cfrmCancel(){
  document.getElementById('cfrmOv').classList.remove('on');
  lockScroll(false);
  _cfrmCb=null;
}

