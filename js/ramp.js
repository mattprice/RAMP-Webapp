/**
 * Settings
 */

var websocket = null;
var context = null;
var nextTime = 0;
var scrubberLength = 0;

var socketURL = "127.0.0.1:8080";
// var socketURL = "ramp-server.embercode.com";

var trackURL = "tracks.json";
// trackURL = "http://ramp.embercode.com/tracks.json"

// A list of the possible CSS styles for each waveform.
var waveformStyles = [
  "wf-blue",
  "wf-green",
  "wf-yellow",
  "wf-orange",
  "wf-red",
  "wf-purple"
];

/**
 * Socket Connection Functions
 */

try {
  // Connect to the websocket.
  console.log("Beginning socket connection.");
  websocket = new WebSocket("ws://" + socketURL + "/stream");
  websocket.binaryType = "arraybuffer";
} catch(e) {
  $("#status").html(
    "WebSockets are not supported in this browser." +
    "<br>Please use the latest version of Google Chrome, Safari, or Firefox."
  );
}

try {
  window.AudioContext = window.AudioContext || window.webkitAudioContext || window.MozWebSocket;
  context = new AudioContext();
} catch(e) {
  // TODO: This needs to be displayed to the user somewhere.
  console.log("Web Audio API is not supported in this browser.");
  $("#status").html(
    "The Web Audio API is not supported in this browser." +
    "<br>Please use the latest version of Google Chrome, Safari, or Firefox."
  );
}

websocket.onopen = function() {
  console.log("Connected to the socket server.");

  // Load the interface.
  loadInterface();
  $("#status").hide();

  // Prepare the server for streaming.
  // websocket.send("/position 0.0f");
  // websocket.send("/master/vol -0.98f");
}

websocket.onclose = function() {
  // TODO: Hide the controls and waveforms, reshow the status.
  // This also gets called if the server fails to connect.
  console.log("Disconnected from the socket server.");

  if ( $("#status").is(":hidden") ) {
    $("#status").html("Server Disconnected");
    $("#status").show();

    $("footer").hide();
    $("#track-controls").hide();
    $("#track-waveforms").hide();
    $("#track-position").hide();
  } else {
    $("#status").html("Connection Failed");
  }
};

// NOTE: You can apparently do typeof message.data == "string".
websocket.onmessage = function(message) {
  var leftChannel = [], rightChannel = [];

  // Convert the message data so that each value is between -1 and 1.
  var intArray = new Int16Array(message.data);
  for (var i = 0; i < intArray.length; i++) {
    var val = (intArray[i] > 0) ? intArray[i]/32767 : intArray[i]/32768;

    // De-interleave the channels.
    if (i % 2 == 0) {
      leftChannel.push(val);
    } else {
      rightChannel.push(val);
    }
  }

  // Create a new AudioBuffer.
  var source = context.createBufferSource();
  var buffer = context.createBuffer(2, leftChannel.length, 48000);
  buffer.getChannelData(0).set(leftChannel);
  buffer.getChannelData(1).set(rightChannel);
  source.buffer = buffer;
  source.connect(context.destination);

  // Schedule the AudioBuffer for playback.
  source.start(nextTime);
  nextTime += buffer.duration;

  // Move the scrubber.
  if ($("#master-play input").attr("data-status") == "playing") {
    $("#track-position").val(function(index, value) {
      return buffer.duration /  songLength * scrubberLength + value*1.0;
    });
  }
}

/**
 * User Interface Functions
 */

function loadInterface() {
  // Request the track information (in JSON format) from the webserver.
  // This will eventually get requested from the RAMP Server instead.
  $.getJSON(trackURL, function(trackList) {
    scrubberLength = trackList["length"] * 30;
    songLength = trackList["length"];

    // Render the song title.
    var songTitle = $.templates("{{:title}}").render(trackList);
    $("h1").html(songTitle);
    document.title = "RAMP - " + songTitle;

    /**
    * Track Controls
    */

    var controlsTemplate = $.templates($("#track-controls").html());
    $("#track-controls").html(
      controlsTemplate.render(trackList["tracks"])
    ).css("display", "block");

    /**
    * Track Waveforms
    */

    var waveformsTemplate = $.templates($("#track-waveforms").html());
    $("#track-waveforms").html(
      waveformsTemplate.render(trackList["tracks"], {
        waveformStyle:function(num) {
          // Assigns a different background color to each waveform.
          return waveformStyles[num % waveformStyles.length];
        },
        waveformWidth:function(length) {
          // Returns the image width: length (in seconds) * 30px
          return length * 30;
        }
      })
    ).css("display", "block");

    $(".track").each(function() {
      $(this).css("width", scrubberLength);
    });

    /**
     * Track Scrubber
     */

    // Set the correct scrubber width and number of steps.
    $("#track-position").css("width", scrubberLength);
    $("#track-position").attr("max", scrubberLength*1.65);
    $("#track-position").css("display", "inline");

    $("#track-position").change(function() {
      var elem = $(this);
      var val = elem.val() / scrubberLength;

      websocket.send("/position " + val);
    });

    /**
    * Low, Medium, High Knobs
    */

    $(".knob").knob({
      angleArc:     300,
      angleOffset:  -150,
      max:          100,
      min:          -100,
      width:        35,
      height:       35,
      thickness:    .45,
      cursor:       true,
      displayInput: false,
      bgColor:      "#555",
      fgColor:      "#3498db",

      change: function(value) {
        var elem = this.$;
        var num = elem.attr("data-track");
        var freq = elem.attr("data-freq");

        console.log("/track" + num + "/" + freq + " " + value);
        websocket.send("/track" + num + "/" + freq + " " + value);
      },
      cancel: function() {
        // TODO: Need to grab the current value and resend if canceled.
        // console.log("cancel: ");
      },
      draw: function () {
        this.cursorExt = 0.25;

        var a = this.arc(this.cv)  // Arc
          , pa                     // Previous arc
          , r = 1;

        this.g.lineWidth = this.lineWidth;
      }
    });

    /**
    * Mute Button
    */

    $(".mute-button").click(function() {
      var elem = $(this);
      var num = elem.attr("data-track");

      // Alert the websocket, toggle the button styles, and toggle the waveform styles.
      if (elem.hasClass("enabled")) {
        websocket.send("/track" + num + "/mute 0");
        elem.removeClass("enabled");
        $("#track-" + num + " img").removeClass("isMuted");
      } else {
        websocket.send("/track" + num + "/mute 1");
        elem.addClass("enabled");
        $("#track-" + num + " img").addClass("isMuted");
      }
    });

    /**
    * Solo Button
    */

    $(".solo-button").click(function() {
      // Toggle the solo button.
      var elem = $(this);
      var num = elem.attr("data-track");

      // Alert the websocket, toggle the button styles, and toggle the waveform styles.
      if (elem.hasClass("enabled")) {
        websocket.send("/track" + num + "/solo 0");
        elem.removeClass("enabled");
        $("#track-" + num + " img").removeClass("isSolo");
      } else {
        websocket.send("/track" + num + "/solo 1");
        elem.addClass("enabled");
        $("#track-" + num + " img").addClass("isSolo");
      }

      // If there are no more soloed tracks, re-enable everything.
      if ( $(".isSolo").length === 0 ) {
        $(".waveform").each(function() {
          $(this).removeClass("notSolo");
        })
      }

      // Otherwise, visually disable all other tracks.
      else {
        $(".waveform").each(function() {
          var wf = $(this);
          if ( !wf.hasClass("isSolo") ) {
            wf.addClass("notSolo");
          } else {
            wf.removeClass("notSolo");
          }
        })
      }
    })

    /**
    * Left-Right Panning
    */

    $(".balance input").change(function() {
      var elem = $(this);
      var num = elem.attr("data-track");
      var val = elem.val();

      websocket.send("/track" + num + "/pan " + val/10.0);
    });

    /**
    * Track Volume
    */

    $(".volume input").change(function() {
      var elem = $(this);
      var num = elem.attr("data-track");
      var val = elem.val();

      websocket.send("/track" + num + "/vol " + val/10.0);
    });

    /**
    * Master Volume
    */

    $("#master-volume input").change(function() {
      var elem = $(this);
      var num = elem.attr("data-track");
      var val = elem.val();

      // websocket.send("/master/vol " + val/10.0);
      websocket.send("/master/vol " + (-0.98 + val/10.0/50.0) );
    });

    /**
    * Play/Pause Button.
    */

    // NOTE: The image displays what will happen, not what is happening.
    $("#master-play input").click(function() {
      var elem = $(this);

      // Swapping from Play to Pause.
      if (elem.attr("data-status") == "playing") {
        elem.attr("src", "img/play.png");
        elem.attr("data-status", "paused");

        websocket.send("/pause");
      }

      // Swapping from Pause to Play.
      else {
        elem.attr("src", "img/pause.png");
        elem.attr("data-status", "playing");

        websocket.send("/play");
      }
    });
    $("footer").css("opacity", 1);

    /**
    * Saved EQ Operations
    */

    // If there are any pre-muted tracks (in tracks.json), mute them.
    // This can be expanded to perform other saved EQ operations in the future.
    var tracks = trackList["tracks"];
    tracks.forEach(function(track) {
      if (track.muted) {
        $(".mute-button[data-track=" + track.num + "]").click();
      }
    });
  }); // $.getJSON()

  // Don't let the controls scoll vertically.
  $(window).scroll(function() {
    // We calculate this every scroll incase the user has resized the window.
    var maxHeight = $(document).height() - $(window).height();
    var scrollTop = $(document).scrollTop() || $("html, body").scrollTop();

    // Don't let the controls scoll vertically.
    // NOTE: If scrollTop is greater than maxHeight the user has scrolled
    // past the end of the page, which is why we don't move the controls.
    if (scrollTop <= maxHeight) {
      $("#track-controls").css("margin-top", "-" + scrollTop + "px");
    }
  });
}