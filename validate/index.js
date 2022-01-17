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
const { github, utils } = require('zowe-common')
const fs = require('fs')
const Debug = require('debug')
const debug = Debug('zowe-release:validate')

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE

// Gets inputs
var buildName = core.getInput('build-name')
var buildNum = core.getInput('build-num')
var releaseVersion = core.getInput('release-version')

//mandatory check
utils.mandatoryInputCheck(buildName, 'build-name')
utils.mandatoryInputCheck(buildNum, 'build-num')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

// init
var zoweReleaseJsonFile = 'zowe-release-v@.json'
if (releaseVersion.startsWith('1')) {
    zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'1')
} else if (releaseVersion.startsWith('2')) {
    zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'2')
}
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))

// this is the target Artifactory path will be released to
var releaseFilesPattern = `${zoweReleaseJsonObject.zowe.to}/org/zowe/${releaseVersion}/*`

// check artifactory release pattern
console.log(`Checking if ${releaseVersion} already exists in Artifactory ...`)
var searchResult = searchArtifact(releaseFilesPattern)
if (!searchResult || searchResult == null || searchResult == '') {
    logValidate(`>>[validate 1/???]>> Target artifactory folder ${releaseFilesPattern} doesn\'t exist, may proceed.`)
} else {
    throw new Error(`Zowe version ${releaseVersion} already exists (${releaseFilesPattern})`)
}

// check if tag already exists
if (github.tagExistsRemote(`v${releaseVersion}`)) {
    throw new Error(`Repository tag v${releaseVersion} already exists.`)
} else {
    logValidate(`>>[validate 2/???]>> Repository tag v${releaseVersion} doesn't exist, may proceed.`)
}

// start to build up a new json derived from the zowe release json file
var releaseArtifacts = {}
releaseArtifacts.zowe = {}
releaseArtifacts.zowe.target = `zowe-${releaseVersion}.pax`
releaseArtifacts.zowe.buildName = buildName
releaseArtifacts.zowe.buildNumber = buildNum

// get zowe build source artifact
releaseArtifacts.zowe.source = searchArtifact(
  `${zoweReleaseJsonObject.zowe.from}/${zoweReleaseJsonObject.zowe.path}/${zoweReleaseJsonObject.zowe.filesAtSource['zowe-*.pax']}`,
  buildName,
  buildNum
)
console.log(`>>>> Found Zowe build ${releaseArtifacts.zowe.source.path}`)

// try to get Zowe build commit hash
if (releaseArtifacts.zowe.source.props['vcs.revision'][0] != '' ) {
    releaseArtifacts.zowe.revision = releaseArtifacts.zowe.source.props['vcs.revision'][0]
}
else {
    throw new Error(`Zowe release artifact vcs revision is null`)
} 
if (!releaseArtifacts.zowe.revision.match(/^[0-9a-fA-F]{40}$/)) { // if it's a valid SHA-1 commit hash
  throw new Error(`Cannot extract git revision from build \"${releaseArtifacts.zowe.buildName}/${releaseArtifacts.zowe.buildNumber}\"`)
}
logValidate(`>>[validate 3/???]>> Build ${releaseArtifacts.zowe.buildName}/${releaseArtifacts.zowe.buildNumber} commit hash is ${releaseArtifacts.zowe.revision}, may proceed.`)
logValidate(`>>[validate 3/???]>> vcs url is ${releaseArtifacts.zowe.source.props['vcs.url'][0]}, vcs revision is ${releaseArtifacts.zowe.revision}`)

// // get SMP/e build
// try {
//   def smpeTarSource = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_SMPE_PAX_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (smpeTarSource['path']) {
//     echo ">>> Found SMP/e build ${smpeTarSource['path']}."
//     def FMID = smpeTarSource['path'].split('/').last().split('-').first()
//     releaseArtifacts['smpe-zip'] = [:]
//     releaseArtifacts['smpe-zip']['source'] = smpeTarSource
//     releaseArtifacts['smpe-zip']['target'] = "zowe-smpe-package-${params.ZOWE_RELEASE_VERSION}.zip".toString()
//   }

//   try {
//     def smpePtfPromote = pipeline.artifactory.getArtifact([
//       'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_SMPE_PTF_PROMOTE_FILEPATTERN}",
//       'build-name'   : releaseArtifacts['zowe']['buildName'],
//       'build-number' : releaseArtifacts['zowe']['buildNumber']
//     ])
//     echo ">>> Found SMP/e promote tar ${smpePtfPromote['path']}."
//     smpePtfPromoteTarPath = smpePtfPromote['path']
//   } catch (e2) {
//     echo ">>> no SMP/e promote tar found in the build, throwing error and exit"
//     error "no SMP/e promote tar found in the build"
//   }
// } catch (e1) {
//   echo ">>> no SMP/e zip found in the build, throwing error and exit"
//   error "no SMP/e zip found in the build"
// }

// // get Docker images - amd64
// try {
//   def dockerImageAmd64 = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_DOCKER_AMD64_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (dockerImageAmd64['path']) {
//     echo ">>> Found Docker image amd64 version ${dockerImageAmd64['path']}."
//     def FMID = dockerImageAmd64['path'].split('/').last().split('-').first()
//     releaseArtifacts['docker-amd64'] = [:]
//     releaseArtifacts['docker-amd64']['source'] = dockerImageAmd64
//     releaseArtifacts['docker-amd64']['target'] = "server-bundle.amd64-${params.ZOWE_RELEASE_VERSION}.tar".toString()
//   }
// } catch (e1) {
//   echo ">>> no Docker image amd64 version found in the build."
// }
// // get Docker images with sources - amd64
// try {
//   def dockerImageSourcesAmd64 = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_DOCKER_AMD64_SOURCE_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (dockerImageSourcesAmd64['path']) {
//     echo ">>> Found Docker image amd64 sources version ${dockerImageSourcesAmd64['path']}."
//     def FMID = dockerImageSourcesAmd64['path'].split('/').last().split('-').first()
//     releaseArtifacts['docker-amd64-sources'] = [:]
//     releaseArtifacts['docker-amd64-sources']['source'] = dockerImageSourcesAmd64
//     releaseArtifacts['docker-amd64-sources']['target'] = "server-bundle.sources.amd64-${params.ZOWE_RELEASE_VERSION}.tar".toString()
//   }
// } catch (e1) {
//   echo ">>> no Docker image amd64 sources version found in the build."
// }

// // get Docker images - s390x
// try {
//   def dockerImageS390x = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_DOCKER_S390X_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (dockerImageS390x['path']) {
//     echo ">>> Found Docker image s390x version ${dockerImageS390x['path']}."
//     def FMID = dockerImageS390x['path'].split('/').last().split('-').first()
//     releaseArtifacts['docker-s390x'] = [:]
//     releaseArtifacts['docker-s390x']['source'] = dockerImageS390x
//     releaseArtifacts['docker-s390x']['target'] = "server-bundle.s390x-${params.ZOWE_RELEASE_VERSION}.tar".toString()
//   }
// } catch (e1) {
//   echo ">>> no Docker image s390x version found in the build."
// }
// // get Docker images with sources - s390x
// try {
//   def dockerImageSourcesS390x = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_DOCKER_S390X_SOURCE_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (dockerImageSourcesS390x['path']) {
//     echo ">>> Found Docker image s390x sources version ${dockerImageSourcesS390x['path']}."
//     def FMID = dockerImageSourcesS390x['path'].split('/').last().split('-').first()
//     releaseArtifacts['docker-s390x-sources'] = [:]
//     releaseArtifacts['docker-s390x-sources']['source'] = dockerImageSourcesS390x
//     releaseArtifacts['docker-s390x-sources']['target'] = "server-bundle.sources.s390x-${params.ZOWE_RELEASE_VERSION}.tar".toString()
//   }
// } catch (e1) {
//   echo ">>> no Docker image s390x sources version found in the build."
// }

// // get containerization
// try {
//   def containerization = pipeline.artifactory.getArtifact([
//     'pattern'      : "${params.ZOWE_BUILD_REPOSITORY}/${params.ZOWE_BUILD_PATH}/${ZOWE_RELEASE_CONTAINERIZATION_FILEPATTERN}",
//     'build-name'   : releaseArtifacts['zowe']['buildName'],
//     'build-number' : releaseArtifacts['zowe']['buildNumber']
//   ])
//   if (containerization['path']) {
//     echo ">>> Found containerization version ${containerization['path']}."
//     def FMID = containerization['path'].split('/').last().split('-').first()
//     releaseArtifacts['containerization'] = [:]
//     releaseArtifacts['containerization']['source'] = containerization
//     releaseArtifacts['containerization']['target'] = "zowe-containerization-${params.ZOWE_RELEASE_VERSION}.zip".toString()
//   }
// } catch (e1) {
//   echo ">>> no containerization version found in the build."
// }

// // find the Zowe CLI build number will be promoted
// releaseArtifacts['cli'] = [:]
// releaseArtifacts['cli']['target'] = "zowe-cli-package-${params.ZOWE_RELEASE_VERSION}.zip".toString()
// releaseArtifacts['cli-plugins'] = [:]
// releaseArtifacts['cli-plugins']['target'] = "zowe-cli-plugins-${params.ZOWE_RELEASE_VERSION}.zip".toString()

// // CLI Core
// releaseArtifacts['cli']['buildName'] = params.ZOWE_CLI_BUILD_NAME
// releaseArtifacts['cli']['buildNumber'] = params.ZOWE_CLI_BUILD_NUMBER

// // CLI Plugins
// releaseArtifacts['cli-plugins']['buildName'] = params.ZOWE_CLI_BUILD_NAME
// releaseArtifacts['cli-plugins']['buildNumber'] = params.ZOWE_CLI_BUILD_NUMBER

// // get CLI CORE build source artifact
// releaseArtifacts['cli']['source'] = pipeline.artifactory.getArtifact([
//   'pattern'      : "${params.ZOWE_CLI_BUILD_REPOSITORY}/${params.ZOWE_CLI_BUILD_PATH}/${ZOWE_RELEASE_CLI_CORE_FILEPATTERN}",
//   // 'build-name'   : releaseArtifacts['cli']['buildName'],       // we no longer rely on jenkins to find artifacts
//   // 'build-number' : releaseArtifacts['cli']['buildNumber']      // we no longer rely on jenkins to find artifacts
// ])
// echo ">>> Found Zowe CLI build ${releaseArtifacts['cli']['source']['path']}."

// // get CLI PLUGINS builds source artifact
// releaseArtifacts['cli-plugins']['source'] = pipeline.artifactory.getArtifact([
//   'pattern'      : "${params.ZOWE_CLI_BUILD_REPOSITORY}/${params.ZOWE_CLI_BUILD_PATH}/${ZOWE_RELEASE_CLI_PLUGINS_FILEPATTERN}",
//   // 'build-name'   : releaseArtifacts['cli-plugins']['buildName'],       // we no longer rely on jenkins to find artifacts
//   // 'build-number' : releaseArtifacts['cli-plugins']['buildNumber']      // we no longer rely on jenkins to find artifacts
// ])
// echo ">>> Found Zowe CLI Plugins ${releaseArtifacts['cli-plugins']['source']['path']}."

// // try to get Zowe CLI CORE build commit hash
// if (releaseArtifacts['cli']['buildName'] && releaseArtifacts['cli']['buildNumber']) {
//   def cliBuildInfo = pipeline.artifactory.getBuildInfo(
//       releaseArtifacts['cli']['buildName'],
//       releaseArtifacts['cli']['buildNumber'],
//       'zowe-cli'
//   )
// }
// // releaseArtifacts['cli']['revision'] = cliBuildInfo && cliBuildInfo['vcsRevision']
// // if (!("${releaseArtifacts['cli']['revision']}" ==~ /^[0-9a-fA-F]{40}$/)) { // if it's a SHA-1 commit hash
// //   error "Cannot extract git revision from build \"${releaseArtifacts['cli']['buildName']}/${releaseArtifacts['cli']['buildNumber']}\""
// // }
// // echo ">>>> Build ${releaseArtifacts['cli']['buildName']}/${releaseArtifacts['cli']['buildNumber']} commit hash is ${releaseArtifacts['cli']['revision']}, may proceed."

// // try to get Zowe CLI Plugins build commit hash
// if (releaseArtifacts['cli-plugins']['buildName'] && releaseArtifacts['cli-plugins']['buildNumber']) {
//   def cliPluginsBuildInfo = pipeline.artifactory.getBuildInfo(
//       releaseArtifacts['cli-plugins']['buildName'],
//       releaseArtifacts['cli-plugins']['buildNumber'],
//       'zowe-cli'
//   )
// }
// // releaseArtifacts['cli-plugins']['revision'] = cliPluginsBuildInfo && cliPluginsBuildInfo['vcsRevision']
// // if (!("${releaseArtifacts['cli-plugins']['revision']}" ==~ /^[0-9a-fA-F]{40}$/)) { // if it's a SHA-1 commit hash
// //   error "Cannot extract git revision from build \"${releaseArtifacts['cli-plugins']['buildName']}/${releaseArtifacts['cli-plugins']['buildNumber']}\""
// // }
// // echo "


// This function will return a json object
// example:
// {
//     "path": "libs-snapshot-local/org/zowe/1.27.0-RC/zowe-1.27.0-rc-214-20220114164537.pax",
//     "type": "file",
//     "size": 409941504,
//     "created": "2022-01-14T16:45:56.528Z",
//     "modified": "2022-01-14T16:45:46.223Z",
//     "sha1": "e0de3a175aa45328fbe3bef115fb4c9686d790a0",
//     "md5": "cd01c8511b1d0b232007c42a580e4de1",
//     "props": {
//       "build.name": [
//         "zowe-install-packaging/rc"
//       ],
//       "build.number": [
//         "214"
//       ],
//       "build.timestamp": [
//         "1642177162837"
//       ],
//       "vcs.branch": [
//         "rc"
//       ],
//       "vcs.revision": [
//         "6411a292cb627d67c1386e6a07e9c22e64a4a20f"
//       ],
//       "vcs.url": [
//         "https://github.com/zowe/zowe-install-packaging.git"
//       ]
//     }
//   }
function searchArtifact(pattern, buildName, buildNum) {
    if ((buildName == '' && buildNum != '') || (buildName != '' && buildNum == '')) {
        throw new Error ('Function searchArtifact must have neither buildName or buildNum, or both')
    }
    var cmd = `jfrog rt search`
    if (buildName && buildNum) {
        cmd += ` --build="${buildName}/${buildNum}"`
    }
    cmd += ` ${pattern} | jq -r '.[]'`
    debug(`searchArtifact full command: ${cmd}`)
    var out = utils.sh(cmd)
    if (!out || out == null || out == '') {
        return
    }
    else {
        return JSON.parse(out)
    }
}

function logValidate(msg) {
    console.log(`%c${msg}`, 'color: green')
}
