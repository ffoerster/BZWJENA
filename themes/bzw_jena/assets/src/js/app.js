window.$ = window.jQuery = require('jquery');
import 'popper.js';
import UIkit from 'uikit';
import Icons from 'uikit/dist/js/uikit-icons';
import AOS from 'aos';
import Shariff from 'shariff';

$(document).ready(function(){

  UIkit.use(Icons);

  AOS.init({
    once: true
  });

  // TYPEKIT LOADER

  (function(d) {
    var config = {
        kitId: 'hms3yeh',
        scriptTimeout: 3000,
        async: true
      },
      h=d.documentElement,t=setTimeout(function(){h.className=h.className.replace(/\bwf-loading\b/g,"")+" wf-inactive";},config.scriptTimeout),tk=d.createElement("script"),f=false,s=d.getElementsByTagName("script")[0],a;h.className+=" wf-loading";tk.src='https://use.typekit.net/'+config.kitId+'.js';tk.async=true;tk.onload=tk.onreadystatechange=function(){a=this.readyState;if(f||a&&a!="complete"&&a!="loaded")return;f=true;clearTimeout(t);try{Typekit.load(config)}catch(e){}};s.parentNode.insertBefore(tk,s)
  })(document);

  // FB Shariff
  var buttonsContainer = $('.some-selector');
  new Shariff(buttonsContainer, {
    orientation: 'vertical'
  });

});