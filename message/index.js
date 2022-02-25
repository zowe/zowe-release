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
const { utils } = require('zowe-common')
const fs = require('fs')

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
    else if(pattern.includes('zowe-cli-package') && pattern.endsWith('zip')) {
        message.push(`CLI Core Package: ${urlPrefix}${pattern}`)
        slackMessage.push(`CLI Core Package: ${urlPrefix}${pattern}`)
    }
    else if(pattern.includes('zowe-cli-plugins') && pattern.endsWith('zip')) {
        message.push(`CLI Plugins Package: ${urlPrefix}${pattern}`)
        slackMessage.push(`CLI Plugins Package: ${urlPrefix}${pattern}`)
    }
})
message.push(`
*************************************************************************************************`)
console.log(message.join('\n'))
core.setOutput('slack-message',slackMessage.join('\\n'))


