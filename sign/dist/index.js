/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 806:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 946:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 412:
/***/ ((module) => {

module.exports = eval("require")("debug");


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
const actionsGithub = __nccwpck_require__(946)
const { utils } = __nccwpck_require__(726)
const fs = __nccwpck_require__(747)
const Debug = __nccwpck_require__(412)
const debug = Debug('zowe-release:sign')
const context = actionsGithub.context

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE
const DEFAULT_GPG_CODE_SIGNING_KEY_PASSPHRASE = 'code-signing-key-passphrase-jack'
const DEFAULT_GPG_CODE_SIGNING_PRIVATE_KEY_FILE = 'code-signing-key-private-jack'
const localReleaseFolder = process.env.LOCAL_RELEASE_FOLDER
const DEFAULT_HASH_ALGORITHM = 'SHA512'

// Gets inputs
var promoteJsonFileNameFull = core.getInput('promote-json-file-name-full')
var releaseVersion = core.getInput('release-version')
const keyID = core.getInput('key-id')
const privateKeyPath = core.getInput('private-key-path')
const privateKeyPassphrase = core.getInput('private-key-passphrase')

// mandatory check
utils.mandatoryInputCheck(promoteJsonFileNameFull, 'promote-json-file-name-full')
utils.mandatoryInputCheck(releaseVersion, 'release-version')
utils.mandatoryInputCheck(keyID, 'key-id')
utils.mandatoryInputCheck(privateKeyPath, 'private-key-path')
utils.mandatoryInputCheck(privateKeyPassphrase, 'private-key-passphrase')

// init
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))
var promoteJsonObject = JSON.parse(fs.readFileSync(promoteJsonFileNameFull))

// this is the target Artifactory path will be released to
var targetPath = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}/`

var uploadArtifacts = {"files":[]}

// add zowe sources into final upload file spec object
// only if it is a formal release, otherwise there will be no source generated
if (process.env.IS_FORMAL_RELEASE) {
    uploadArtifacts['files'].push({
        "pattern" : `${localReleaseFolder}/zowe_sources-*.zip`,
        "target"  : targetPath
    })
}

// sign and hash each file then add into upload file spec object
Object.values(promoteJsonObject).forEach(properties => {
    if (!properties['target']) { // we simply skip signing when property is zowe
        return 
    }
    var file = `${localReleaseFolder}/${properties['target']}`
    if (utils.fileExists(file, true)) {    
        console.log(`>>> Signing ${properties['target']} ...`)
        doSign(file)
        uploadArtifacts['files'].push({
            "pattern" : `${file}.asc`,
            "target"  : targetPath
        })

        console.log(`>>> Generating hash of ${properties['target']} ...`)
        doHash(file)
        uploadArtifacts['files'].push({
            "pattern" : `${file}.sha512`,
            "target"  : targetPath
        })
    }
    else {
        throw new Error(`I am looking for ${file} but it doesn't exist!`)
    }
});

// write code-signing-key-info.json
utils.sh(`curl -o .release/code-signing-key-info.json https://raw.githubusercontent.com/zowe/zowe-install-packaging/master/signing_keys/${keyID}.json`)
if (!utils.fileExists('.release/code-signing-key-info.json', true)) {
    throw new Error(`Failed to download code signing key info json`)
}
uploadArtifacts['files'].push({
    "pattern" : '.release/code-signing-key-info.json',
    "target"  : targetPath
})

// write version, no need to upload to Artifactory
fs.writeFileSync('.release/version', releaseVersion)

// write uploadArtifacts to a file
var signJsonFileNameFull = process.env.RUNNER_TEMP + '/sign-and-upload-artifacts.json'
core.setOutput('SIGN_JSON_FILE_NAME_FULL', signJsonFileNameFull)
fs.writeFileSync(signJsonFileNameFull, JSON.stringify(uploadArtifacts, null, 2))


// input file here is a full file path
function doSign(file) {
    var signature = `${file}.asc`
    
    // imported key if not exist
    if (!gpgKeyExists(keyID)) {
        console.log(`Importing code signing key ${keyID} ...`)
        var cmd = `gpg --batch --passphrase "${privateKeyPassphrase}" --import "${privateKeyPath}"`
        utils.sh(cmd)
        if (!gpgKeyExists(keyID)) {
            throw new Error(`Code signing key ${keyID} is not imported correctly.`)
        }
    }

    if (utils.fileExists(signature, true)) {
        throw new Error(`Signature file ${signature} already exists.`)
    }

    // sign the file
    console.log(`Signing ${file} with key ${keyID} ...`)
    var cmd2 = `echo "${privateKeyPassphrase}" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --local-user ${keyID} --sign --armor --detach-sig ${file}`
    utils.sh(cmd2)

    if (!utils.fileExists(signature, true)) {
        throw new Error(`Signature file ${signature} is not created.`)
    }

}

// input file here is a full file path
function doHash(file) {
    var algo = DEFAULT_HASH_ALGORITHM
    var filePath = utils.sh(`dirname "${file}"`)
    var fileName = utils.sh(`basename "${file}"`)
    var hashFileName = `${fileName}.${algo.toLowerCase()}`
    if (utils.fileExists(hashFileName, true)) {
        console.warn(`[Warning] Hash file ${hashFileName} already exists, will overwrite.`)
    }

    // generate hash
    console.log(`Generating hash for ${fileName} ...`)
    utils.sh(`cd ${filePath} && gpg --print-md "${algo}" "${fileName}" > "${hashFileName}"`)

    if (!utils.fileExists(`${filePath}/${hashFileName}`, true)) {
        throw new Error(`Hash file ${hashFileName} is not created.`)
    }
}

function gpgKeyExists(key) {
    var out = utils.sh('gpg --list-keys')
    return out.includes(key)
}
})();

module.exports = __webpack_exports__;
/******/ })()
;