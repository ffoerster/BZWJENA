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

  // FB Shariff
  var buttonsContainer = $('.some-selector');
  new Shariff(buttonsContainer, {
    orientation: 'vertical'
  });

});