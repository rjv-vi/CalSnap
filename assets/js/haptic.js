// ══════════════════════════════════════════════════
// HAPTIC FEEDBACK — Android Chrome navigator.vibrate
// ══════════════════════════════════════════════════
let _hfxOn = localStorage.getItem('hfx_enabled') !== '0';
const HFX = {
  isOn: () => _hfxOn,
  setOn: (v) => { _hfxOn = v; localStorage.setItem('hfx_enabled', v?'1':'0'); },
  _v: (pat) => { try { if(_hfxOn && navigator.vibrate) navigator.vibrate(pat); } catch(e){} },
  light:   () => HFX._v(8),
  medium:  () => HFX._v(16),
  heavy:   () => HFX._v(30),
  success: () => HFX._v([12,40,18]),
  error:   () => HFX._v([20,60,20,60,20]),
  tick:    () => HFX._v(4),
  double:  () => HFX._v([10,50,10]),
};

function toggleHfx() {
  const newVal = !HFX.isOn();
  HFX.setOn(newVal);
  const tog = document.getElementById('hfxToggle');
  if(tog) tog.classList.toggle('on', newVal);
  if(newVal) setTimeout(()=>HFX.medium(), 80);
}

// Проверяем после сплэша

(function(){
  const s=document.getElementById('splashOv');
  if(!s) return;
  // Звук запуска приложения
  SFX.play('splash');
  // Failsafe: принудительно скрыть через 5с при любых ошибках
  const _failsafe = setTimeout(() => { if(s) s.style.display='none'; }, 5000);
  setTimeout(()=>{
    s.classList.add('hide');
    setTimeout(()=>{
      clearTimeout(_failsafe);
      s.style.display='none';
      // Проверяем интернет после сплэша
      // Only show offline modal if browser confirms no connection
      if(!navigator.onLine){
        showOfflineModal();
      }
      // Don't run slow ping check on startup — navigator.onLine is sufficient
    },550);
  },1800);
})();

let _notifTimers = []; // must be declared before init() — it's used by _scheduleNotifs()
// init() is invoked at the end of init.js, after all dependent modules have loaded.

