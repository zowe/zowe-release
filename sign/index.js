/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2022
 */

const core = require('@actions/core')
const actionsGithub = require('@actions/github')
const { utils } = require('zowe-common')
const fs = require('fs')
const Debug = require('debug')
const debug = Debug('zowe-release:sign')
const context = actionsGithub.context

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE
const DEFAULT_GPG_CODE_SIGNING_KEY_PASSPHRASE = 'code-signing-key-passphrase-jack'
const DEFAULT_GPG_CODE_SIGNING_PRIVATE_KEY_FILE = 'code-signing-key-private-jack'
const localReleaseFolder = process.env.LOCAL_RELEASE_FOLDER

// Gets inputs
var promoteJsonFileNameFull = core.getInput('promote-json-file-name-full')
var releaseVersion = core.getInput('release-version')

// mandatory check
utils.mandatoryInputCheck(promoteJsonFileNameFull, 'promote-json-file-name-full')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

// init
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))
var promoteJsonObject = JSON.parse(fs.readFileSync(promoteJsonFileNameFull))

// this is the target Artifactory path will be released to
var targetPath = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}/`

var uploadArtifacts = {"files":[]}

// add zowe sources into final upload file spec object
uploadArtifacts['files'].push({
    "pattern" : `${localReleaseFolder}/zowe_sources-*.zip`,
    "target"  : targetPath
})

for (let [properties] of Object.values(promoteJsonObject)) {
    var file = `${localReleaseFolder}/${properties['target']}`
    if (utils.fileExists(file)) {    
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

}


function doSign(file) {


}

function doHash(file) {



}

    //   // write code-signing-key-info.json
    //   def signingKeyId = signing.getSigningKey()
    //   sh "curl -o .release/code-signing-key-info.json https://raw.githubusercontent.com/zowe/zowe-install-packaging/master/signing_keys/${signingKeyId}.json"
    //   if (!fileExists('.release/code-signing-key-info.json')) {
    //     error "Failed to download code signing key info json"
    //   }
    //   uploadArtifacts['files'].push([
    //     "pattern" : '.release/code-signing-key-info.json',
    //     "target"  : releaseFilePath + '/'
    //   ])

    //   // write version, no need to upload to Artifactory
    //   writeFile file: '.release/version', text: params.ZOWE_RELEASE_VERSION

    //   // debug show uploadArtifacts
    //   writeJSON file: '.tmp-upload-artifacts.json', json: uploadArtifacts, pretty: 2
    //   sh "set +x\n" +
    //       "echo All signing results:\n" +
    //       "echo ===============================================\n" +
    //       "cat .tmp-upload-artifacts.json\n" +
    //       "echo\n" +
    //       "echo ===============================================\n"

    //   echo ">>> Uploading signing results ..."
    //   pipeline.artifactory.upload([spec: '.tmp-upload-artifacts.json'])
    // },