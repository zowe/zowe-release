/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 806:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 726:
/***/ ((module) => {

module.exports = eval("require")("zowe-common");


/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2022
 */

const core = __nccwpck_require__(806)
const { utils } = __nccwpck_require__(726)
const fs = __nccwpck_require__(747)

// Defaults
const urlPrefix = 'https://zowe.jfrog.io/zowe/'

// Gets inputs
var releaseArtifactDownloadFile = core.getInput('release-artifact-download-file')
var releaseVersion = core.getInput('release-version')
var buildNum = core.getInput('build-num')

//mandatory check
utils.mandatoryInputCheck(releaseArtifactDownloadFile, 'release-artifact-download-file')
utils.mandatoryInputCheck(releaseVersion, 'release-version')
utils.mandatoryInputCheck(buildNum, 'build-num')

// init
var nightly = false
if (releaseVersion.includes('nightly')) {
    nightly = true
}
var releaseArtifactJsonObject = JSON.parse(fs.readFileSync(releaseArtifactDownloadFile))
var message = []
var slackMessage = []
message.push(`*************************************************************************************************
Build ${buildNum} is promoted as Zowe ${releaseVersion}, you can download from below:
`)

releaseArtifactJsonObject.files.forEach(function(obj) { 
    var pattern = obj.pattern
    if (pattern.includes('zowe') && pattern.endsWith('.pax')) {
        message.push(`Convenience Pax: ${urlPrefix}${pattern}`)
        slackMessage.push(`Convenience Pax: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('zowe-smpe') && pattern.endsWith('zip')) {
        message.push(`SMPE: ${urlPrefix}${pattern}`)
        slackMessage.push(`SMPE: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('server-bundle.amd64') && pattern.endsWith('tar')) {
        message.push(`Technical preview docker amd64 image: ${urlPrefix}${pattern}`)
        slackMessage.push(`Technical preview docker amd64 image: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('server-bundle.s390x') && pattern.endsWith('tar')) {
        message.push(`Technical preview docker s390x image: ${urlPrefix}${pattern}`)
        slackMessage.push(`Technical preview docker s390x image: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('zowe-containerization') && pattern.endsWith('zip')) {
        message.push(`Containerization: ${urlPrefix}${pattern}`)
        slackMessage.push(`Containerization: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('zowe-PSWI') && pattern.endsWith('.pax.Z')) {
        message.push(`PSWI: ${urlPrefix}${pattern}`)
        slackMessage.push(`PSWI: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('zowe-cli-package') && pattern.endsWith('zip')) {
        message.push(`CLI Core Package: ${urlPrefix}${pattern}`)
        if (nightly && pattern.startsWith('CLI_WAS_COPIED')) {
            slackMessage.push(`The latest cli-package has been promoted as nightly in previous days`)
        }
        else {
            slackMessage.push(`CLI Core Package: ${urlPrefix}${pattern}`)
        }
    }
    else if(pattern.includes('zowe-cli-plugins') && pattern.endsWith('zip')) {
        message.push(`CLI Plugins Package: ${urlPrefix}${pattern}`)
        if (nightly && pattern.startsWith('CLI_WAS_COPIED')) {
            slackMessage.push(`The latest cli-plugins has been promoted as nightly in previous days`)
        }
        else {
            slackMessage.push(`CLI Plugins Package: ${urlPrefix}${pattern}`)
        }
    }
})
message.push(`
*************************************************************************************************`)
if (!nightly) {
    console.log(message.join('\n'))
} 
core.setOutput('slack-message',slackMessage.join('\\n'))





})();

module.exports = __webpack_exports__;
/******/ })()
;