/* Whitelabel-Rechenbeispiel */
(function(){
  var g=function(i){return document.getElementById(i)};
  var n=g('wl-n'),p=g('wl-p'),v=g('wl-v'),a=g('wl-a');
  if(!n)return;
  var f=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  function eur(x){return (x<0?'− ':'')+f.format(Math.abs(Math.round(x)))+' €'}
  function num(el,max){return Math.max(0,Math.min(max,+el.value||0))}
  function calc(){
    var k=+n.value||0,pr=num(p,9999),vb=num(v,9999),au=num(a,500)/100;
    var ein=k*pr,auf=k*vb*au;
    g('wl-n-out').textContent=k;
    g('wl-ein').textContent=eur(ein);
    g('wl-auf').textContent=eur(auf);
    g('wl-rest').textContent=eur(ein+auf-497);
  }
  [n,p,v,a].forEach(function(el){el.addEventListener('input',calc)});calc();
})();
