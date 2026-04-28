// ══════════════════════════════════════════════════════
// CUSTOM CONFIRM MODAL
// ══════════════════════════════════════════════════════
let _cfrmCb=null;
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
    cancelBtn.textContent=typeof cb==='string'?cb:'Понятно';
    cancelBtn.className='cfrm-btn';
  } else {
    okBtn.style.display='';
    okBtn.textContent=okLabel;
    cancelBtn.textContent='Отмена';
    cancelBtn.className='cfrm-btn cancel';
  }
  document.getElementById('cfrmOv').classList.add('on');
  document.body.style.overflow='hidden';
}
function cfrmConfirm(){
  document.getElementById('cfrmOv').classList.remove('on');
  document.body.style.overflow='';
  HFX.heavy();SFX.play('delete');
  if(_cfrmCb)_cfrmCb();
  _cfrmCb=null;
}
function cfrmCancel(){
  document.getElementById('cfrmOv').classList.remove('on');
  document.body.style.overflow='';
  _cfrmCb=null;
}

