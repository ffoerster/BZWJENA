window.$ = window.jQuery = require('jquery');
import 'popper.js';
import AOS from 'aos';
import Shariff from 'shariff';

$(document).ready(function(){

  AOS.init({
    once: true
  });

  // FB Shariff
  var buttonsContainer = $('.some-selector');
  new Shariff(buttonsContainer, {
    orientation: 'vertical'
  });

});