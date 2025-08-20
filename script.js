
const btn = document.querySelector('.nav-toggle');
const nav = document.querySelector('#nav');
if (btn && nav){
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('show');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', e=>{
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if(el){
      e.preventDefault();
      el.scrollIntoView({behavior:'smooth', block:'start'});
      nav?.classList.remove('show');
      btn?.setAttribute('aria-expanded','false');
    }
  });
});
document.getElementById('year').textContent = new Date().getFullYear();
