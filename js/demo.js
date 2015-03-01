var SECOND = 1000;

function convertDegreesToRadians (degrees) {
  return degrees * (Math.PI / 180);
}

var CANVAS_MID_TOP = window.innerHeight / 2;

// demo.js
window.onload = function() {
  var elemPosX = document.getElementById("posX"),
      elemPosY = document.getElementById("posY"),
      elemPosZ = document.getElementById("posZ"),
      elemVelX = document.getElementById("velX"),
      elemVelY = document.getElementById("velY"),
      elemVelZ = document.getElementById("velZ"),
      light    = document.getElementById("constraintLight");

  var dt = 0.1; // multiply by second = hundred microseconds

  var alphaR, betaR, gammaR;
  var top = 0;
  function initGyro() {

    // set frequency of measurements in milliseconds
    gyro.frequency = dt * SECOND;

    gyro.startTracking(function(o) {
      var x, y, z;
      // console.log(o.x);
      if (o.x !== null) {
        ax = parseFloat(o.x.toFixed(5));
        ay = parseFloat(o.y.toFixed(5));
        az = parseFloat(o.z.toFixed(5));

        // angular rotation velocity
        alphaR = convertDegreesToRadians(parseFloat(o.alphaR.toFixed(5))); // Z
        betaR  = convertDegreesToRadians(parseFloat(o.betaR.toFixed(5)));  // X
        gammaR = convertDegreesToRadians(parseFloat(o.gammaR.toFixed(5))); // Y

        // update changes to F matrix
        F_k.elements[3][4] = dt *  alphaR;
        F_k.elements[3][5] = dt * -gammaR;

        F_k.elements[4][3] = dt * -alphaR;
        F_k.elements[4][5] = dt *  betaR;

        F_k.elements[5][3] = dt *  gammaR;
        F_k.elements[5][4] = dt * -betaR;
        KM.F_k = F_k;

        var u_k = $V([ax, ay, az]);
        KM.predict(u_k);

        var accelWithoutGravity = u_k,
            position = $V(KM.x_k.elements.slice(0,3)),
            linearVelocity = $V(KM.x_k.elements.slice(3,6)),
            angularVelocity = $V([betaR, gammaR, alphaR]);

        var linearAccel = accelWithoutGravity.subtract(
            angularVelocity.cross(linearVelocity));

        var posX = KM.x_k.elements[0],
            posY = KM.x_k.elements[1],
            posZ = KM.x_k.elements[2];

        var velX = KM.x_k.elements[3],
            velY = KM.x_k.elements[4],
            velZ = KM.x_k.elements[5];

        // if zero-velocity constraint is applicable
        var tol = 0.15,
            sigma2velUpdate = 0.0001;

        if (Math.abs(u_k.modulus()) < tol) { // not much accel
          // apply zero-velocity constraint through an 'observation' of 0
          var z_k = $V([0,0,0]);
          var H_k = Matrix.Zero(3,3)
                    .augment(Matrix.I(3))
                    .augment(Matrix.Zero(3,3));

          var R_k = Matrix.Diagonal([
            sigma2velUpdate, sigma2velUpdate, sigma2velUpdate
          ]);

          var KO = new KalmanObservation(z_k, H_k, R_k);
          KM.update(KO);

          light.style.display = "block";

        } else {
          light.style.display = "none";
        }

        elemPosX.innerHTML = posX.toFixed(3);
        elemPosY.innerHTML = posY.toFixed(3);
        elemPosZ.innerHTML = posZ.toFixed(3);
        elemVelX.innerHTML = velX.toFixed(3);
        elemVelY.innerHTML = velY.toFixed(3);
        elemVelZ.innerHTML = velZ.toFixed(3);

        var scaleFactor = window.innerWidth / 15,
            width = KM.P_k.elements[2][2] * scaleFactor,  // Z
            height = KM.P_k.elements[1][1] * scaleFactor,  // Y
            left = posZ * scaleFactor - width/2,
            top = (CANVAS_MID_TOP + posY * scaleFactor) - height/2;

        // debugger;
        ell.set({
          rx: width,
          ry: height,
          left: left,
          top: top
        });

        canvas.renderAll();


        // elemVelX.innerHTML = linearAccel.elements[0].toFixed(3);
        // elemVelY.innerHTML = linearAccel.elements[1].toFixed(3);
        // elemVelZ.innerHTML = linearAccel.elements[2].toFixed(3);
        // console.log(KM.x_k);
      }
    });
  }

  // State (3 initial velocities, 3 initial accl biases)
  var x_0 = $V([0, 0, 0, 0, 0, 0, 0, 0, 0]);

  // Covariance Matrix - uncertainity of state (initial error?)
  var initPositionVariance = 0.001,
      initVelocityVariance = 0.001,
      initBiasVariance = 0;

  var P_0 = Matrix.Diagonal([
    initPositionVariance, initPositionVariance, initPositionVariance,
    initVelocityVariance, initVelocityVariance, initVelocityVariance,
    initBiasVariance, initBiasVariance, initBiasVariance
  ]);

  // Transition Matrix - how each variable is updated, update each timestep
  var numStateVars = 9,
      numInputVars = 3;

  F_k = Matrix.I(numStateVars);

  F_k.elements[0][3] = dt;
  F_k.elements[1][4] = dt;
  F_k.elements[2][5] = dt;

  F_k.elements[3][6] = dt;
  F_k.elements[4][7] = dt;
  F_k.elements[5][8] = dt;

  // ~ Control Matrix - converts external inputs for updating state
  var B_k = Matrix.Zero(numStateVars, numInputVars); //$M([[0]]);

  B_k.elements[3][0] = dt;
  B_k.elements[4][1] = dt;
  B_k.elements[5][2] = dt;

  // Prediction Noise Matrix, weights for prediction step, previous matrices
  var pSigmaSquared = .00005,    // change later ?
      vSigmaSquared = .00005,    // change later ?
      bSigmaSquared = .00005;    // change later ?

  var Q_k = Matrix.Diagonal([
    pSigmaSquared, pSigmaSquared, pSigmaSquared,
    vSigmaSquared, vSigmaSquared, vSigmaSquared,
    bSigmaSquared, bSigmaSquared, bSigmaSquared
  ]);

  var KM = new KalmanModel(x_0, P_0, F_k, B_k, Q_k);

  var canvas, ell;

  function addMap () {
    // create a wrapper around native canvas element (with id="c")
    canvas = new fabric.Canvas('container');

    canvas.setDimensions({
      height: window.innerHeight,
      width: window.innerWidth
    });

    // create a rectangle object
    ell = new fabric.Ellipse({
      left: 0,
      top: CANVAS_MID_TOP,
      fill: 'green',
      rx: 10,
      ry: 10
    });

    // "add" rectangle onto canvas
    canvas.add(ell);

  }

  addMap();
  initGyro();

};
