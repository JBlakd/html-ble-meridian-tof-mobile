var myCharacteristic;
// startFrame, middleFrame and endFrame depending on incoming Bluetooth notifications
var frameType;
var deviceName;
var tofDistance = "Starting";
var canvas;
var tempScaleCanvas;
var distributionCanvas;
var tempScaleCtx;
var distributionCtx;
var ctx;
var imgArray = [];
var imgArray2D = [];
var wordCount = 0;
var rangeCelsius = [20, 50];
var rgbStrArray = ['rgb(255,2,240)','rgb(255,0,208)','rgb(255,0,144)','rgb(255,0,80)',
'rgb(255,0,16)','rgb(255,30,0)','rgb(255,70,0)','rgb(255,110,0)','rgb(255,150,0)',
'rgb(255,190,0)','rgb(255,230,0)','rgb(215,255,0)','rgb(62,255,0)','rgb(0,255,92)',
'rgb(0,255,131)','rgb(0,255,244)','rgb(0,180,255)','rgb(0,116,255)','rgb(0,50,255)',
'rgb(0,0,255)'];
var scalingFactor = [5,6,7,8];
var scalingFactorIndex = 0;
var highestTemperatureNormalised = 0;
var highestTemperatureCelsius = -300;
var highestTempVisualCoordinates = [];
var startFrameReceived = 0;
var buckets = [];
var totalTempNormalised = 0;
var meanTempNormalised = 0;
var fortyNinePixelsAroundCursor = [];
var bucketsCount = 0;
var bucketiseCalled = 0;
var bucketsNotCounted = 0;
var humanTempLowerBound = 36;
var highestBucket = 0;
var numBuckets = 40;

scaleElements();
bucketsInit(numBuckets);
// bucketsInit(80);

function connect() {
  // https://infocenter.nordicsemi.com/index.jsp?topic=%2Fcom.nordic.infocenter.sdk5.v13.0.0%2Fble_sdk_app_nus_eval.html
  let serviceUuid         = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  let characteristicUuid  = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

  navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
    })
    .then(device => {
      // log('Connecting...' + "\n");
      deviceName = device.name;
      return device.gatt.connect();
    })
    .then(server => {
      console.log('Getting Service...');
      return server.getPrimaryService(serviceUuid);
    })
    .then(service => {
      console.log('Getting Characteristic...');
      return service.getCharacteristic(characteristicUuid);
    })
    .then(characteristic => {
      myCharacteristic = characteristic;
      return myCharacteristic.startNotifications().then(_ => {
        console.log('> Notifications started');
        console.log("Connected to: " + deviceName + "\n");
        myCharacteristic.addEventListener('characteristicvaluechanged',
          handleNotifications);
      });
    })
    .catch(error => {
      console.log('Argh! ' + error);
    });
}

function disconnect() {
  if (myCharacteristic) {
    myCharacteristic.stopNotifications()
      .then(_ => {
        console.log('> Notifications stopped');
        // log("Disconnected")
        myCharacteristic.removeEventListener('characteristicvaluechanged',
          handleNotifications);
      })
      .catch(error => {
        console.log('Argh! ' + error);
      });
  }
}

// Every 15 seconds, we get datase
// 42 notifications
// 1x 4 bytes
// 40x 244 bytes
// 1x 162 bytes

function handleNotifications(event) {
  let value = event.target.value;

  if (value.getUint8(0).toString(16) == "54") {
    if (value.getUint8(1).toString(16) == "7b") {
      frameType = "startFrame";
    }
  } else if (value.getUint8(value.byteLength - 1).toString(16) == "44") {
    if (value.getUint8(value.byteLength - 2).toString(16) == "7d") {
      frameType = "endFrame";
    }
  } else {
    frameType = "middleFrame";
  }

  console.log("Begin " + frameType);

  // startFrame handler
  if (frameType === "startFrame") {
    startFrameReceived = 1;
    // Put the TOF range inside global variable
    tofDistance = value.getUint16(2);
  }

  // middleFrame handler
  // Each 16 bit word when converted to decimal represents 0.1 degrees Kelvin
  // Normalise the range of [283.1 K, 353.1 K]  to [0, 1]
  if (frameType === "middleFrame") {
    for (var i = 0; i < value.byteLength - 1; i+=2) {
      imgArray[wordCount] = normaliseRange(celsiusToTenthKelvin(rangeCelsius[0]),
        celsiusToTenthKelvin(rangeCelsius[1]), value.getUint16(i));
      bucketise(imgArray[wordCount]);
      totalTempNormalised += imgArray[wordCount];
      wordCount++;
    }
  }

  //endFrame handler
  if (frameType === "endFrame") {
    for (var i = 0; i < value.byteLength - 3; i+=2) {
      imgArray[wordCount] = normaliseRange(celsiusToTenthKelvin(rangeCelsius[0]),
        celsiusToTenthKelvin(rangeCelsius[1]), value.getUint16(i));
      bucketise(imgArray[wordCount]);
      totalTempNormalised += imgArray[wordCount];
      wordCount++;
    }
  }

  // Just-before-end code
  if (frameType === "endFrame") {
    console.log("wordCount: " + wordCount);
    meanTempNormalised = totalTempNormalised/imgArray.length;
    // Converts 1d array into properly dimensioned 80*62 array
    while(imgArray.length) imgArray2D.push(imgArray.splice(0,80));
    console.log(imgArray2D);
    // Perform drawing
    console.log("meanTempNormalised: "+ meanTempNormalised);
    if (startFrameReceived === 1 && wordCount === 4960) {
      highestBucket = findHighestBucket();
      console.log("highestBucket: " + highestBucket);
      console.log("highestBucketTemp: " + denormaliseRange(rangeCelsius[0], rangeCelsius[1], buckets[highestBucket][0]));
      document.getElementById("mostFrequentBucket").innerHTML = denormaliseRange(rangeCelsius[0], rangeCelsius[1], buckets[highestBucket][0]).toString();
      draw();
      // console.log("bucketiseCalled: " + bucketiseCalled)
      // console.log("bucketsCount: " + bucketsCount);
      // console.log("bucketsNotCounted: " + bucketsNotCounted);
    }

    // Clear variables
    imgArray = [];
    imgArray2D = [];
    for (var i = 0; i < buckets.length; i++) {
      buckets[i] = [];
    }
    bucketiseCalled = 0;
    bucketsCount = 0;
    bucketsNotCounted = 0;
    wordCount = 0;
    totalTempNormalised = 0;
    highestTemperatureCelsius = -300;
    highestTemperatureNormalised = 0;
    startFrameReceived = 0;
    fortyNinePixelsAroundCursor = [];
  }
}

function bucketsInit(myNumBuckets) {
  for (var i = 0; i < myNumBuckets; i++) {
    buckets.push([]);
  }
}

function bucketise(num) {
  // Loop through upper threshold for each buckets e.g. 0.025, 0.05, ... , 0.095, 1
  // Done through iterating a multiple of a fraction of 1. E.g. 1/40, 2/40 etc
  // Coldest towards the beginning
  // note that values which lie outside the range will not be bucketised
  bucketiseCalled++;
  let bucketised = false;
  for (var i = 1; i <= buckets.length; i++) {
    if ( num >= (i-1)/buckets.length && num < i/buckets.length) {
      buckets[i-1].push(num);
      bucketsCount++;
      bucketised = true;
      break;
    }
  }
  if (bucketised == false) {
    bucketsNotCounted++;
    // console.log("sample not bucketised: " + num);
  }
}

function canvasInit() {
  canvas = document.getElementById('heatImg');
  if (canvas.getContext) {
    ctx = canvas.getContext('2d');
    //ctx.scale(11,11);
  }
  // check if this DOM element is null. This DOM element is used for development purposes.
  if (!!document.getElementById('distributionScale')) {
    distributionCanvas = document.getElementById('distributionScale');
    if (distributionCanvas.getContext) {
      distributionCtx = distributionCanvas.getContext('2d');
    }
  }
  drawTempScale();
}

function drawTempScale() {
  tempScaleCanvas = document.getElementById('tempScale');
  if (tempScaleCanvas.getContext) {
    tempScaleCtx = tempScaleCanvas.getContext('2d');
    tempScaleCtx.clearRect(0, 0, tempScaleCanvas.width, tempScaleCanvas.height);
    tempScaleCtx.font = (scalingFactor[scalingFactorIndex] + 4).toString() + 'px serif';
    var eachColourHeight = (80*scalingFactor[scalingFactorIndex]/20);
    for (var i = 0; i < 20; i++) {
      tempScaleCtx.fillStyle = rgbStrArray[i];
      tempScaleCtx.fillRect(0, i*(eachColourHeight)+(eachColourHeight/1.25), 30, eachColourHeight);
      tempScaleCtx.fillStyle = 'rgb(255,255,255)';
      tempScaleCtx.fillText( denormaliseRange(rangeCelsius[0], rangeCelsius[1], (1.05-(0.05*i))).toString(), 40, (i*eachColourHeight));
    }
    tempScaleCtx.fillStyle = 'rgb(255,255,255)';
    tempScaleCtx.fillText( denormaliseRange(rangeCelsius[0], rangeCelsius[1], (1.05-(0.05*20))).toString(), 40, (20*eachColourHeight));
    tempScaleCtx.fillText( denormaliseRange(rangeCelsius[0], rangeCelsius[1], (1.05-(0.05*21))).toString(), 40, (21*eachColourHeight));
  }
}

function scaleElements() {
  document.getElementById('heatImg').setAttribute("width",(62*scalingFactor[scalingFactorIndex]).toString());
  document.getElementById('heatImg').setAttribute("height",(80*scalingFactor[scalingFactorIndex]).toString());
  document.getElementById('tempScale').setAttribute("height",(80*scalingFactor[scalingFactorIndex]*1.1).toString());
  document.getElementsByClassName('bodyDiv')[0].style.height = (80*scalingFactor[scalingFactorIndex]*1.1).toString() + "px";
  document.getElementById('heatImg').style.marginBottom = (80*scalingFactor[scalingFactorIndex]/16.5);
  // check if this DOM element is null. This DOM element is used for development purposes.
  if (!!document.getElementById('distributionScale')) {
    document.getElementById('distributionScale').setAttribute("height",(80*scalingFactor[scalingFactorIndex]).toString())
    document.getElementById('distributionScale').style.marginBottom = (80*scalingFactor[scalingFactorIndex]/16.5);
    document.getElementById('distributionScale').setAttribute("width",((62/3)*scalingFactor[scalingFactorIndex]).toString());
  }
}

function draw() {
  scaleElements();
  canvasInit();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  console.log("imgArray2D.length: " + imgArray2D.length);
  console.log("imgArray2D[0].length: " + imgArray2D[0].length);
  // console.log("buckets.length: " + buckets.length);
  //console.log(buckets);
  // var bucketsCount = 0;
  // for (var i = 0; i < buckets.length; i++) {
  //   for (var j = 0; j < buckets[i].length; j++) {
  //     bucketsCount++;
  //   }
  // }
  // console.log("bucketsCount: " + bucketsCount);

  for (var i = 0; i < 62; i++) {
    // var imgRow = imgArray2D[i];
    for (var j = 0; j < 80; j++) {
      // Mapping (colour selection) logic
      if (imgArray2D[i][j] > 0.95) {
        ctx.fillStyle = rgbStrArray[0];
      } else if (imgArray2D[i][j] > 0.90) {
        ctx.fillStyle = rgbStrArray[1];
      } else if (imgArray2D[i][j] > 0.85) {
        ctx.fillStyle = rgbStrArray[2];
      } else if (imgArray2D[i][j] > 0.80) {
        ctx.fillStyle = rgbStrArray[3];
      } else if (imgArray2D[i][j] > 0.75) {
        ctx.fillStyle = rgbStrArray[4];
      } else if (imgArray2D[i][j] > 0.70) {
        ctx.fillStyle = rgbStrArray[5];
      } else if (imgArray2D[i][j] > 0.65) {
        ctx.fillStyle = rgbStrArray[6];
      } else if (imgArray2D[i][j] > 0.60) {
        ctx.fillStyle = rgbStrArray[7];
      } else if (imgArray2D[i][j] > 0.55) {
        ctx.fillStyle = rgbStrArray[8];
      } else if (imgArray2D[i][j] > 0.50) {
        ctx.fillStyle = rgbStrArray[9];
      } else if (imgArray2D[i][j] > 0.45) {
        ctx.fillStyle = rgbStrArray[10];
      } else if (imgArray2D[i][j] > 0.40) {
        ctx.fillStyle = rgbStrArray[11];
      } else if (imgArray2D[i][j] > 0.35) {
        ctx.fillStyle = rgbStrArray[12];
      } else if (imgArray2D[i][j] > 0.30) {
        ctx.fillStyle = rgbStrArray[13];
      } else if (imgArray2D[i][j] > 0.25) {
        ctx.fillStyle = rgbStrArray[14];
      } else if (imgArray2D[i][j] > 0.20) {
        ctx.fillStyle = rgbStrArray[15];
      } else if (imgArray2D[i][j] > 0.15) {
        ctx.fillStyle = rgbStrArray[16];
      } else if (imgArray2D[i][j] > 0.10) {
        ctx.fillStyle = rgbStrArray[17];
      } else if (imgArray2D[i][j] > 0.05) {
        ctx.fillStyle = rgbStrArray[18];
      } else {
        ctx.fillStyle = rgbStrArray[19];
      }
      // Camera on PCB orientation is upside down lol, hence 61-i and 79-j
      ctx.fillRect((61-i)*scalingFactor[scalingFactorIndex], (79-j)*scalingFactor[scalingFactorIndex],
      1*scalingFactor[scalingFactorIndex], 1*scalingFactor[scalingFactorIndex]);

      // Calculate highest Temperature
      // IMPORTANT: ADJUST j and i to correspond to the correct coordinate once
      // device orientation has been confirmed.
      if (imgArray2D[i][j] > highestTemperatureNormalised) {
        highestTemperatureNormalised = imgArray2D[i][j];
        highestTempVisualCoordinates[0] = (61-i);
        highestTempVisualCoordinates[1] = (79-j);
      }
    }
  }
  // calculate highestTemperatureCelsius
  highestTemperatureCelsius = denormaliseRange(rangeCelsius[0], rangeCelsius[1], highestTemperatureNormalised);
  document.getElementById("highestTempValue").innerHTML = highestTemperatureCelsius.toString()
  + "°C at (" + highestTempVisualCoordinates[0] + "," + highestTempVisualCoordinates[1] + ")";

  var highestTempArrayCoordinates = [(61-highestTempVisualCoordinates[0]),(79-highestTempVisualCoordinates[1])];

  // for (var i = highestTempArrayCoordinates[0] - 1; i < highestTempArrayCoordinates[0] + 2; i++) {
  //   for (var j = highestTempArrayCoordinates[1] - 1; j < highestTempArrayCoordinates[1] + 2; j++) {
  //     if (i >= 0 && i < 62 && j >=0 && j < 80) {
  //       ninePixelsAroundCursor.push(imgArray2D[i][j]);
  //     }
  //   }
  // }

  for (var i = highestTempArrayCoordinates[0] - 3; i < highestTempArrayCoordinates[0] + 4; i++) {
    for (var j = highestTempArrayCoordinates[1] - 3; j < highestTempArrayCoordinates[1] + 4; j++) {
      if (i >= 0 && i < 62 && j >=0 && j < 80) {
        fortyNinePixelsAroundCursor.push(imgArray2D[i][j]);
      }
    }
  }
  // Sort array in ascending order
  fortyNinePixelsAroundCursor.sort(function(a, b) {return a-b});

  if (tofDistance === 0) {
    document.getElementById("tofValue").innerHTML = "Out Of Range";
  } else {
    document.getElementById("tofValue").innerHTML = tofDistance.toString(10);
  }

  document.getElementById("imgDimValue").innerHTML = (80*scalingFactor[scalingFactorIndex]).toString()
  + " by " + (62*scalingFactor[scalingFactorIndex]).toString();

  // if (tofDistance > 300) {
  //   document.getElementById("meanTempValue").innerHTML = "Place forehead closer."
  // }
  // else if (tofDistance < 100) {
  //   document.getElementById("meanTempValue").innerHTML = "Forehead too close."
  // }
  // else {
  // console.log(fortyNinePixelsAroundCursor);
    document.getElementById("meanTempValue").innerHTML
      = denormaliseRange(rangeCelsius[0], rangeCelsius[1], thirdQuartile(fortyNinePixelsAroundCursor)).toFixed(2)
        + "°C";
  // }

  // Draw crosshair at the pixel with highest temperature
  ctx.fillStyle = "rgb(0,0,0)";
  // Two semicircles Top & Bottom
  ctx.beginPath();
  ctx.arc((highestTempVisualCoordinates[0]+0.5)*scalingFactor[scalingFactorIndex],
    (highestTempVisualCoordinates[1]+0.5)*scalingFactor[scalingFactorIndex],
    scalingFactor[scalingFactorIndex] + 4, 0, Math.PI);
  ctx.closePath();
  ctx.arc((highestTempVisualCoordinates[0]+0.5)*scalingFactor[scalingFactorIndex],
    (highestTempVisualCoordinates[1]+0.5)*scalingFactor[scalingFactorIndex],
    scalingFactor[scalingFactorIndex] + 4, 0, Math.PI, true);
  ctx.stroke();
  // One more left-aligned semicircle to complete the crosshair.
  ctx.beginPath();
  ctx.arc((highestTempVisualCoordinates[0]+0.5)*scalingFactor[scalingFactorIndex],
      (highestTempVisualCoordinates[1]+0.5)*scalingFactor[scalingFactorIndex],
      scalingFactor[scalingFactorIndex] + 4, 0.5*Math.PI, 1.5*Math.PI);
  ctx.closePath();
  ctx.stroke();
  // check if this DOM element is null. This DOM element is used for development purposes.
  if (!!document.getElementById('distributionScale')) {
    drawDistribution();
  }
}

// This function is called from draw()
function drawDistribution() {
  distributionCtx.clearRect(0,0,distributionCanvas.width, distributionCanvas.height);
  var bucketHeight = (80*scalingFactor[scalingFactorIndex])/(buckets.length);
  // This variable is always calculated to be the same as the one from scaleElements()
  var boxWidth = (62/3)*scalingFactor[scalingFactorIndex];
  // For each bucket
  // Draw a rectangle with upper left pixel at (0, i*bucketHeight)
  // Number of elements in each bucket cannot exceed (80*62)/(20)
  // The width is (Number of elements in each bucket / (80*62)/(20)) * bucketWidth
  for (i = 0; i < buckets.length; i++) {

    distributionCtx.fillStyle = rgbStrArray[Math.ceil( rgbStrArray.length - 1 - i/(buckets.length/rgbStrArray.length) )];
    distributionCtx.fillRect(0, (buckets.length-1-i)*bucketHeight, (buckets[i].length / ((80*62)/(10)) ) * boxWidth
      , bucketHeight);

    // Draw something special for the highest bucket
    if (i === highestBucket) {
        distributionCtx.fillStyle = "rgb(255,255,255)";
        distributionCtx.fillRect(0, (buckets.length-1-i)*bucketHeight, (buckets[i].length / ((80*62)/(10)) ) * boxWidth
          , bucketHeight);

        distributionCtx.fillStyle = "rgb(0,0,0)";
        // distributionCtx.font = 'bolder 10px Arial';
        distributionCtx.fillText(denormaliseRange(rangeCelsius[0], rangeCelsius[1], buckets[highestBucket][0]).toString(), 0, (buckets.length-0.5-i)*bucketHeight)
          //denormaliseRange(rangeCelsius[0], rangeCelsius[1], buckets[highestBucket][0])
    }
  }
}

// Maps a number in given range to a float between 0 and 1
function normaliseRange(xMin, xMax, xVal) {
  return (xVal - xMin) / (xMax - xMin);
}

function denormaliseRange(xMin, xMax, norm) {
  return norm*(xMax - xMin) + xMin;
}

function celsiusToTenthKelvin(celsius) {
  return (celsius + 273.15) * 10;
}

function tenthKelvinToCelsius(tenthKelvin) {
  return (tenthKelvin / 10) - 273.15;
}

function scaleUp() {
  if (scalingFactorIndex === scalingFactor.length - 1) {
    return;
  } else {
    return scalingFactorIndex++;
  }
}

function scaleDown() {
  if (scalingFactorIndex === 0) {
    return;
  } else {
    return scalingFactorIndex--;
  }
}

function avgArray(array) {
  var total = 0;
  for (var i = 0; i < array.length; i++) {
     total += array[i];
  }
  return total/array.length;
}

function thirdQuartile(array) {
  // if array.length is odd
  if (array.length % 2 != 0) {
    return ((array[array.length - Math.ceil(array.length/4)] + array[array.length - Math.floor(array.length/4)])/2);
  } else {
    return (array[array.length - Math.ceil(array.length/4)]);
  }
}

function medianArray(array) {
  if (array.length % 2 != 0) {
    return (array[array.length - Math.ceil(array.length/2)]);
  } else {
    return ((array[array.length - array.length/2] + array[array.length - array.length/2 - 1])/2);
  }
}

// Find highest bucket while constrained by humanTempLowerBound
function findHighestBucket() {
  var lowerBound = normaliseRange(rangeCelsius[0], rangeCelsius[1], humanTempLowerBound);
  // console.log("lowerBound: " + lowerBound);
  var lowerBoundBucket = Math.floor(lowerBound * buckets.length);
  // console.log("lowerBoundBucket: " + lowerBoundBucket);
  var result = lowerBoundBucket;
  for (var i = lowerBoundBucket; i < buckets.length; i++) {
      if (buckets[i].length > buckets[result].length) {
        result = i;
      }
  }
  return result;
}
