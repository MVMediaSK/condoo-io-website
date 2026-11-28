/* Affiliate-Provisionsrechner */
(function(){
  var ins=[].slice.call(document.querySelectorAll('#rechner input[data-preis]'));
  if(!ins.length)return;
  var f=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  var g=function(i){return document.getElementById(i)};
  function calc(){
    var k=0,m=0;
    ins.forEach(function(el){var n=Math.max(0,Math.min(999,Math.floor(+el.value||0)));k+=n;m+=n*(+el.dataset.preis)*0.3;});
    var b=k>=200?1000:(k>=100?500:0);
    g('af-k').textContent=f.format(k);
    g('af-b').textContent=b?f.format(b)+' €':'ab 100 Kunden';
    g('af-m').textContent=f.format(m+b)+' €';
    g('af-j').textContent=f.format((m+b)*12)+' €';
  }
  ins.forEach(function(el){el.addEventListener('input',calc)});calc();
})();
