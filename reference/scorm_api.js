/**
 * Standard SCORM 1.2 API Wrapper for LMS (Moodle, K12Online, vnEdu, Canvas, Blackboard)
 */
var findAPITries = 0;
var maxTries = 500;
var scormAPI = null;

function findAPI(win) {
  while ((win.API == null) && (win.parent != null) && (win.parent != win)) {
    findAPITries++;
    if (findAPITries > maxTries) return null;
    win = win.parent;
  }
  return win.API;
}

function getAPI() {
  if (scormAPI) return scormAPI;
  var theAPI = findAPI(window);
  if ((theAPI == null) && (window.opener != null) && (typeof(window.opener) != "undefined")) {
    theAPI = findAPI(window.opener);
  }
  scormAPI = theAPI;
  return scormAPI;
}

window.ScormHelper = {
  isInitialized: false,
  init: function() {
    var api = getAPI();
    if (api) {
      var res = api.LMSInitialize("");
      this.isInitialized = (res === "true" || res === true);
      console.log("[SCORM 1.2] LMSInitialize:", this.isInitialized);
      return this.isInitialized;
    }
    console.log("[SCORM 1.2] No LMS API found, running in standalone mode.");
    return false;
  },
  setStatus: function(status) { // 'passed', 'completed', 'failed', 'incomplete'
    var api = getAPI();
    if (api && this.isInitialized) {
      api.LMSSetValue("cmi.core.lesson_status", status);
      api.LMSCommit("");
    }
  },
  setScore: function(score, maxScore, minScore) {
    var api = getAPI();
    if (api && this.isInitialized) {
      api.LMSSetValue("cmi.core.score.raw", score.toString());
      if (maxScore) api.LMSSetValue("cmi.core.score.max", maxScore.toString());
      if (minScore) api.LMSSetValue("cmi.core.score.min", minScore.toString());
      api.LMSCommit("");
    }
  },
  setSuspendData: function(dataStr) {
    var api = getAPI();
    if (api && this.isInitialized) {
      api.LMSSetValue("cmi.suspend_data", dataStr);
      api.LMSCommit("");
    }
  },
  getSuspendData: function() {
    var api = getAPI();
    if (api && this.isInitialized) {
      return api.LMSGetValue("cmi.suspend_data");
    }
    return "";
  },
  finish: function() {
    var api = getAPI();
    if (api && this.isInitialized) {
      api.LMSCommit("");
      api.LMSFinish("");
      this.isInitialized = false;
    }
  }
};

window.addEventListener("beforeunload", function() {
  if (window.ScormHelper) window.ScormHelper.finish();
});
