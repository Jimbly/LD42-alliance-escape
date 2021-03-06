(function () {
  var debug = document.getElementById('debug');
  window.onerror = function (e, file, line) {
    debug.innerText = e + '\n  at ' + file + '(' + line + ')';
  };
  window.debugmsg = function (msg) {
    debug.innerText += msg + '\n';
  };
}());

var canvasSupported = true;
(function() {
  var contextNames = ['webgl', 'experimental-webgl'];
  var context = null;
  var canvas = document.createElement('canvas');

  document.body.appendChild(canvas);

  for (var i = 0; i < contextNames.length; i += 1) {
    try {
      context = canvas.getContext(contextNames[i]);
    } catch (e) {}

    if (context) {
      break;
    }
  }
  if (!context)
  {
    canvasSupported = false;
    window.alert('Sorry, but your browser does not support WebGL or does not have it enabled.');
  }

  document.body.removeChild(canvas);
}());

window.assert = function(exp) {
  if (!exp) {
    let e = new Error();
    console.log(e.stack);
    window.alert('assertion failed');
    throw e;
  }
};

// Embedded code and startup code.
window.onload = function () {
  const app = require('./app.js');
  let canvas = document.getElementById('turbulenz_game_engine_canvas');
  canvas.focus();

  function resizeCanvas() {
    // This happens in turbulenzengine.js:resizeCanvas() already:
    // var css_to_real = window.devicePixelRatio || 1;
    // canvas.width = Math.floor(canvas.parentNode.clientWidth * css_to_real);
    // canvas.height = Math.floor(canvas.parentNode.clientHeight * css_to_real);

    // This used to be here, but it breaks mobile devices!
    // Might be needed to get gamepad input though?
    //canvas.focus();

    // maybe force trigger immediate draw too?
    window.need_repos = 10;
  }
  // resize the canvas to fill browser window dynamically
  window.addEventListener('resize', resizeCanvas, false);
  resizeCanvas();

  if (canvas.getContext && canvasSupported) {
    app.main(canvas);
  }
};
