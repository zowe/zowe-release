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
uploadArtifacts['files'].push({
    "pattern" : `${localReleaseFolder}/zowe_sources-*.zip`,
    "target"  : targetPath
})

Object.values(promoteJsonObject).forEach(properties => {
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
});


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

    if (utils.fileExists(signature)) {
        throw new Error(`Signature file ${signature} already exists.`)
    }

    // sign the file
    console.log(`Signing ${file} with key ${keyID} ...`)
    var cmd2 = `echo "${privateKeyPassphrase}" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --local-user ${keyID} --sign --armor --detach-sig ${file}`
    utils.sh(cmd2)

    if (!utils.fileExists(signature)) {
        throw new Error(`Signature file ${signature} is not created.`)
    }

}

function doHash(file) {



}

function gpgKeyExists(key) {
    var out = utils.sh('gpg --list-keys')
    return out.contains(key)
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