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
const semver = require('semver');
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
var validateArtifactoryFolder = core.getBooleanInput('validate-artifactory-folder')
var validateReleaseVerTag = core.getBooleanInput('validate-release-ver-tag')
var validatePax = core.getBooleanInput('validate-pax')
var validateCommitHash = core.getBooleanInput('validate-commit-hash')
var validateSMPE = core.getBooleanInput('validate-smpe')
var validateSMPEPromoteTar = core.getBooleanInput('validate-smpe-promote-tar')
var validateDockerAmd64 = core.getBooleanInput('validate-docker-amd64')
var validateDockerAmd64Sources = core.getBooleanInput('validate-docker-amd64-sources')
var validateDockerS390x = core.getBooleanInput('validate-docker-s390x')
var validateDockerS390xSources = core.getBooleanInput('validate-docker-s390x-sources')
var validateContainerization = core.getBooleanInput('validate-containerization')
var validateCLIPackage = core.getBooleanInput('validate-cli-package')
var validateCLIPlugins = core.getBooleanInput('validate-cli-plugins')
var validateCLIPythonSDK = core.getBooleanInput('validate-cli-python-sdk')
var validateCLINodejsSDK = core.getBooleanInput('validate-cli-nodejs-sdk')
var validateCLINodejsSDKTypedoc = core.getBooleanInput('validate-cli-nodejs-sdk-typedoc')
var validatePswi = core.getBooleanInput('validate-pswi')

//mandatory check
utils.mandatoryInputCheck(buildName, 'build-name')
utils.mandatoryInputCheck(buildNum, 'build-num')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

var nightlyV1 = false
var nightlyV2 = false
var nightlyV3 = false
var realPromote = true

console.log(`Checking if ${releaseVersion} is a valid semantic version ...`)
if (releaseVersion.includes('nightly')) {
    if (releaseVersion == 'nightly-v1') {
        nightlyV1 = true
        logValidate('Skip check since it is v1 nightly pipeline')
    }
    else if (releaseVersion == 'nightly-v2') {
        nightlyV2 = true
        logValidate('Skip check since it is v2 nightly pipeline')
    } 
    else if (releaseVersion == 'nightly-v3') {
        nightlyV3 = true
        logValidate('Skip check since it is v3 nightly pipeline')
    }
    realPromote = false
}
else {
    realPromote = true

    // validate release version scheme
    // thanks semver/semver, this regular expression comes from
    // https://github.com/semver/semver/issues/232#issuecomment-405596809
    // in javascript regex \d means [0-9]; in bash you should do [0-9]
    if (semver.valid(releaseVersion)) {
        logValidate('YES')
    }
    else {
        throw new Error(`${releaseVersion} is not a valid semantic version.`)
    }

    if (releaseVersion.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)) {
        core.exportVariable('IS_FORMAL_RELEASE', 'true')
        console.log(`>>>> Version ${releaseVersion} is considered as a FORMAL RELEASE.`)
    }
    else {
        console.log(`>>>> Version ${releaseVersion} is NOT considered as a FORMAL RELEASE.`)
    }
}

var promoteBundles = null;
if (realPromote) {
    promoteBundles = semver.major(releaseVersion) > 3 || (semver.major(releaseVersion) === 2 && semver.minor(releaseVersion) >= 18);
}

// init
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))

// this is the target Artifactory path will be released to
var releaseFilesPattern = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}/*`

if (validateArtifactoryFolder) {
    // check artifactory release pattern
    console.log(`Checking if ${releaseVersion} already exists in Artifactory ...`)
    var searchResult = searchFolder(releaseFilesPattern)
    if (!searchResult || searchResult == null || searchResult == '') {
        logValidate(`>>[validate 1/17]>> Target artifactory folder ${releaseFilesPattern} doesn\'t exist.`)
    } 
    else {
        const sbomsOnly = searchResult.reduce((prev, curr) => {
            const buildName = folderItem?.props["build.name"]
            if (buildName && !buildName.startsWith('zowe-dependency-scan')) {
                return prev && false;
            } 
            return prev && true;
        });
        if (!sbomsOnly) {
            throw new Error(`Zowe version ${releaseVersion} already exists (${releaseFilesPattern})`)
        }
    }
} 
else {
    logSkipValidate(`>>[validate 1/17]>> Manually skipped target artifactory folder: ${releaseFilesPattern}`)
}

if (validateReleaseVerTag) {
    // check if tag already exists
    if (github.tagExistsRemote(`v${releaseVersion}`)) {
        throw new Error(`Repository tag v${releaseVersion} already exists.`)
    } 
    else {
        logValidate(`>>[validate 2/17]>> Repository tag v${releaseVersion} doesn't exist.`)
    }
} 
else {
    logSkipValidate(`>>[validate 2/17]>> Manually skipped checking repository tag v${releaseVersion}`)
}

// start to build up a new json derived from the zowe release json file
var releaseArtifacts = {}
releaseArtifacts['zowe'] = {}
releaseArtifacts['zowe']['buildName'] = buildName
releaseArtifacts['zowe']['buildNumber'] = buildNum

if (validateCommitHash) {
    // try to get Zowe pax commit hash since pax will guarenteed to be in the build even if we don't promote it
    var zowePax = searchArtifact(
        `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax']}`,
        buildName,
        buildNum
    )
    if (zowePax['props']['vcs.revision'][0] != '') {
        releaseArtifacts['zowe']['revision'] = zowePax['props']['vcs.revision'][0]
    }
    else {
        throw new Error(`Zowe release artifact vcs revision is null`)
    }

    if (!releaseArtifacts['zowe']['revision'].match(/^[0-9a-fA-F]{40}$/)) { // if it's a valid SHA-1 commit hash
        throw new Error(`Cannot extract git revision from build \"${releaseArtifacts['zowe']['buildName']}/${releaseArtifacts['zowe']['buildNumber']}\"`)
    }
    
    logValidate(`>>[validate 3/17]>> Build ${releaseArtifacts['zowe']['buildName']}/${releaseArtifacts['zowe']['buildNumber']} commit hash is ${releaseArtifacts['zowe']['revision']}.`)
}
else {
    logSkipValidate(`>>[validate 3/17]>> Manually skipped commit hash parsing.`)
}

if (validatePax) {
    // get zowe build source artifact
    var zowePax = searchArtifact(
        `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax']}`,
        buildName,
        buildNum
    )

    if (promoteBundles) {
        var zowePaxBundle = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax.bundle']}`,
            buildName,
            buildNum
        )
        if (zowePaxBundle['path']) {
            releaseArtifacts['zowe-pax-bundle'] = {}
            releaseArtifacts['zowe-pax-bundle']['source'] = zowePaxBundle
            if (realPromote) {
                releaseArtifacts['zowe-pax-bundle']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax.bundle'].replace(/\*/g, releaseVersion)
            } else {
                releaseArtifacts['zowe-pax-bundle']['target'] = zowePaxBundle['path'].split("/").pop() //pop returns last item in array, ie. part after last slash
            }
        } else {
            throw new Error(`no zowe pax sigstore bundle found in the build`);
        }
    }
 
    if (zowePax['path']) {
        releaseArtifacts['zowe-pax'] = {}
        releaseArtifacts['zowe-pax']['source'] = zowePax
        if (realPromote) {
            releaseArtifacts['zowe-pax']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-*.pax'].replace(/\*/g, releaseVersion)
        }
        else {
            //nightly artifact does not alter its name, just use the name from staging jfrog folder
            releaseArtifacts['zowe-pax']['target'] = zowePax['path'].split("/").pop() //pop returns last item in array, ie. part after last slash
        }
    }
    else {
        throw new Error(`no zowe pax found in the build`)
    }
    logValidate(`>>[validate 4/17]>> Found Zowe build ${releaseArtifacts['zowe-pax']['source']['path']}.`)
}
else {
    logSkipValidate(`>>[validate 4/17]>> Manually skipped Zowe pax.`)
}

// get SMP/e build
if (validateSMPE) {
    try {

        if (promoteBundles) {
            var smpeZipSourceBundle = searchArtifact(
                `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip.bundle']}`,
                buildName,
                buildNum
            )
            if (smpeZipSourceBundle['path']) {
                releaseArtifacts['smpe-source-bundle'] = {}
                releaseArtifacts['smpe-source-bundle']['source'] = smpeZipSourceBundle
                if (realPromote) {
                    releaseArtifacts['smpe-source-bundle']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip.bundle'].replace(/\*/g, 'package-'+releaseVersion)
                } else {
                    releaseArtifacts['smpe-source-bundle']['target'] = smpeZipSourceBundle['path'].split("/").pop() //pop returns last item in array, ie. part after last slash
                }
            } else {
                throw new Error(`no zowe-smpe zip sigstore bundle found in the build`);
            }
        }

        var smpeZipSource = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip']}`,
            buildName,
            buildNum
        )
      
        if (smpeZipSource['path']) {
            releaseArtifacts['smpe-zip'] = {}
            releaseArtifacts['smpe-zip']['source'] = smpeZipSource
            if (realPromote) {
                // special note that target for smpe shall be 'smpe-package'
                releaseArtifacts['smpe-zip']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-smpe-*.zip'].replace(/\*/g, 'package-' + releaseVersion)
            }
            else {
                releaseArtifacts['smpe-zip']['target'] = smpeZipSource['path'].split("/").pop()
            }
            logValidate(`>>[validate 5/17]>> Found SMP/e build ${smpeZipSource['path']}.`)
        }
    }
    catch (e1) {
        throw new Error(`>>> no SMP/e zip found in the build`)
    }
}
else {
    logSkipValidate(`>>[validate 5/17]>> Manually skipped SMP/e zip file.`)
}

if (validateSMPEPromoteTar) {
    try {
        var smpePromoteTar = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['smpe-promote-*.tar']}`,
            buildName,
            buildNum
        )
        logValidate(`>>[validate 6/17]>> Found SMP/e promote tar ${smpePromoteTar['path']}.`)
        core.exportVariable('SMPE_PTF_PROMOTE_TAR_PATH', smpePromoteTar['path'])
    } 
    catch (e2) {
        throw new Error(`no SMP/e promote tar found in the build`)
    }
}
else {
    logSkipValidate(`>>[validate 6/17]>> Manually skipped checking SMP/e PTF promote tar.`)
}

// get Docker images - amd64 - this is a v1 specific task (including v1 nightly)
if (validateDockerAmd64) {
    try {
        var dockerImageAmd64 = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.amd64-*.tar']}`,
            buildName,
            buildNum
        )
        if (dockerImageAmd64['path']) {
            releaseArtifacts['docker-amd64'] = {}
            releaseArtifacts['docker-amd64']['source'] = dockerImageAmd64
            if (nightlyV1) {
                releaseArtifacts['docker-amd64']['target'] = dockerImageAmd64['path'].split("/").pop()
            }
            else {
                releaseArtifacts['docker-amd64']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.amd64-*.tar'].replace(/\*/g, releaseVersion)
            }
            logValidate(`>>[validate 7/17]>> Found Docker image amd64 version ${dockerImageAmd64['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error(`>>> no Docker image amd64 version found in the build.`)
    }
}
else {
    logSkipValidate(`>>[validate 7/17]>> Manually skipped docker image amd64.`)
}

// docker sources amd64, docker s390x, docker sources s390x only needs for v1 real promote
if (validateDockerAmd64Sources) {
    // get Docker images with sources - amd64
    try {
        var dockerImageSourcesAmd64 = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.amd64-*.tar']}`,
            buildName,
            buildNum
        )
        if (dockerImageSourcesAmd64['path']) {
            releaseArtifacts['docker-amd64-sources'] = {}
            releaseArtifacts['docker-amd64-sources']['source'] = dockerImageSourcesAmd64
            releaseArtifacts['docker-amd64-sources']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.amd64-*.tar'].replace(/\*/g, releaseVersion)
            logValidate(`>>[validate 8/17]>> Found Docker image amd64 sources version ${dockerImageSourcesAmd64['path']}.`)
        }
    } catch (e1) {
        throw new Error(`>>> no Docker image amd64 sources version found in the build.`)
    }
}
else {
    logSkipValidate(`>>[validate 8/17]>> Manually skipped Docker image amd64 sources.`)
}

if (validateDockerS390x) {
    // get Docker images - s390x
    try {
        var dockerImageS390x = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.s390x-*.tar']}`,
            buildName,
            buildNum
        )
        if (dockerImageS390x['path']) {
            releaseArtifacts['docker-s390x'] = {}
            releaseArtifacts['docker-s390x']['source'] = dockerImageS390x
            releaseArtifacts['docker-s390x']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.s390x-*.tar'].replace(/\*/g, releaseVersion)
            logValidate(`>>[validate 9/17]>> Found Docker image s390x version ${dockerImageS390x['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error(`>>> no Docker image s390x version found in the build.`)
    }
}
else {
    logSkipValidate(`>>[validate 9/17]>> Manually skipped Docker image s390x`)
}

if (validateDockerS390xSources) {
    // get Docker images with sources - s390x
    try {
        var dockerImageSourcesS390x = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.s390x-*.tar']}`,
            buildName,
            buildNum
        )
        if (dockerImageSourcesS390x['path']) {
            releaseArtifacts['docker-s390x-sources'] = {}
            releaseArtifacts['docker-s390x-sources']['source'] = dockerImageSourcesS390x
            releaseArtifacts['docker-s390x-sources']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['server-bundle.sources.s390x-*.tar'].replace(/\*/g, releaseVersion)
            logValidate(`>>[validate 10/17]>> Found Docker image s390x sources version ${dockerImageSourcesS390x['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error(`>>> no Docker image s390x sources version found in the build.`)
    }
}
else {
    logSkipValidate(`>>[validate 9/17]>> Manually skipped Docker image s390x sources`)
}

if (validateContainerization) {
    // get containerization
    try {

        if (promoteBundles) {
            var containerBundle = searchArtifact(
                `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip.bundle']}`,
                buildName,
                buildNum
            )
            if (containerBundle['path']) {
                releaseArtifacts['containerization-bundle'] = {}
                releaseArtifacts['containerization-bundle']['source'] = containerBundle
                if (realPromote) {
                    releaseArtifacts['containerization-bundle']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip.bundle'].replace(/\*/g, releaseVersion)
                }
                else {
                    releaseArtifacts['containerization-bundle']['target'] = containerBundle['path'].split('/').pop()
                }
                logValidate(`>>[validate 11/17]>> Found containerization version ${containerBundle['path']}.`)
            }
        }

        var containerization = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip']}`,
            buildName,
            buildNum
        )
        if (containerization['path']) {
            releaseArtifacts['containerization'] = {}
            releaseArtifacts['containerization']['source'] = containerization
            if (realPromote) {
                releaseArtifacts['containerization']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-containerization-*.zip'].replace(/\*/g, releaseVersion)
            }
            else {
                releaseArtifacts['containerization']['target'] = containerization['path'].split('/').pop()
            }
            logValidate(`>>[validate 11/17]>> Found containerization version ${containerization['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error(`>>> no containerization version found in the build.`)
    }
}
else {
    logSkipValidate(`>>[validate 11/17]>> Manually skipped containerization.zip.`)
}

if (validateCLIPackage) {
    // get CLI CORE build source artifact
    try {
        var cliPackages
        if (realPromote) {
            cliPackages = searchArtifact(
                `${zoweReleaseJsonObject['zowe-cli']['from']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-package-*.zip']}`
            )
        }
        else {
            cliPackages = searchArtifact(
                `${zoweReleaseJsonObject['zowe-cli']['nightlyFrom']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-package-*.zip']}`
            )
        }
        if (cliPackages['path']) {
            releaseArtifacts['cli'] = {}
            releaseArtifacts['cli']['source'] = cliPackages
            if (realPromote) {
                releaseArtifacts['cli']['target'] = zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-package-*.zip'].replace(/[0-9]\*/g, releaseVersion)
            }
            else {
                releaseArtifacts['cli']['target'] = 'cli/' + cliPackages['path'].split('/').pop() // prefix cli is to put cli artifacts copied to org/zowe/nightly/cli/* or org/zowe/nightly/v2/cli/*
            }
            logValidate(`>>[validate 12/17]>> Found Zowe CLI build ${releaseArtifacts['cli']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no CLI package is found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 12/17]>> Manually skipped Zowe CLI package`)
}

if (validateCLIPlugins) {
    // get CLI PLUGINS builds source artifact
    try {
        var cliPlugins
        if (realPromote) {
            cliPlugins = searchArtifact(
                `${zoweReleaseJsonObject['zowe-cli']['from']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-plugins-*.zip']}`
            )
        }
        else {
            cliPlugins = searchArtifact(
                `${zoweReleaseJsonObject['zowe-cli']['nightlyFrom']}/${zoweReleaseJsonObject['zowe-cli']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-plugins-*.zip']}`
            )
        }
        if (cliPlugins['path']) {
            releaseArtifacts['cli-plugins'] = {}
            releaseArtifacts['cli-plugins']['source'] = cliPlugins
            if (realPromote) {
                releaseArtifacts['cli-plugins']['target'] = zoweReleaseJsonObject['zowe-cli']['sourceFiles']['zowe-cli-plugins-*.zip'].replace(/[0-9]\*/g, releaseVersion)
            }
            else {
                releaseArtifacts['cli-plugins']['target'] = 'cli/' + cliPlugins['path'].split('/').pop()     // prefix cli is to put cli artifacts copied to org/zowe/nightly/cli/*
            }
            logValidate(`>>[validate 13/17]>> Found Zowe CLI Plugins ${releaseArtifacts['cli-plugins']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no CLI plugins is found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 13/17]>> Manually skipped Zowe CLI Plugins.`)
}

if (validateCLIPythonSDK) {
    try {
        // get CLI python sdk build artifacts
        var cliPythonSDK = searchArtifact(
            `${zoweReleaseJsonObject['zowe-cli-sdk']['from']}/${zoweReleaseJsonObject['zowe-cli-sdk']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-python-sdk-*.zip']}`
        )
        if (cliPythonSDK['path']) {
            releaseArtifacts['cli-python-sdk'] = {}
            releaseArtifacts['cli-python-sdk']['source'] = cliPythonSDK
            releaseArtifacts['cli-python-sdk']['target'] = zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-python-sdk-*.zip'].replace(/[0-9]\*/g, releaseVersion)
            logValidate(`>>[validate 14/17]>> Found Zowe CLI Python SDK ${releaseArtifacts['cli-python-sdk']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no CLI Python SDK found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 14/17]>> Manually skipped Zowe CLI Python SDK.`)
}

if (validateCLINodejsSDK) {
    try {
        // get CLI nodejs sdk build artifacts
        var cliNodejsSDK = searchArtifact(
            `${zoweReleaseJsonObject['zowe-cli-sdk']['from']}/${zoweReleaseJsonObject['zowe-cli-sdk']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-nodejs-sdk-*.zip']}`
        )
        if (cliNodejsSDK['path']) {
            releaseArtifacts['cli-nodejs-sdk'] = {}
            releaseArtifacts['cli-nodejs-sdk']['source'] = cliNodejsSDK
            releaseArtifacts['cli-nodejs-sdk']['target'] = zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-nodejs-sdk-*.zip'].replace(/[0-9]\*/g, releaseVersion)
            logValidate(`>>[validate 15/17]>> Found Zowe CLI NodeJS SDK ${releaseArtifacts['cli-nodejs-sdk']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no CLI NodeJS SDK found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 15/17]>> Manually skipped Zowe CLI NodeJS SDK.`)
}

if (validateCLINodejsSDKTypedoc) {
    try {
        // get CLI nodejs sdk typedoc build artifacts
        var cliNodejsSDKTypedoc = searchArtifact(
            `${zoweReleaseJsonObject['zowe-cli-sdk']['from']}/${zoweReleaseJsonObject['zowe-cli-sdk']['sourcePath']}/*/${zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-nodejs-sdk-typedoc-*.zip']}`
        )
        if (cliNodejsSDKTypedoc['path']) {
            releaseArtifacts['cli-nodejs-sdk-typedoc'] = {}
            releaseArtifacts['cli-nodejs-sdk-typedoc']['source'] = cliNodejsSDKTypedoc
            releaseArtifacts['cli-nodejs-sdk-typedoc']['target'] = zoweReleaseJsonObject['zowe-cli-sdk']['sourceFiles']['zowe-nodejs-sdk-typedoc-*.zip'].replace(/[0-9]\*/g, releaseVersion)
            logValidate(`>>[validate 16/17]>> Found Zowe CLI NodeJS Typedoc SDK ${releaseArtifacts['cli-nodejs-sdk-typedoc']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no CLI NodeJS Typedoc SDK found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 16/17]>> Manually skipped Zowe CLI NodeJS Typedoc SDK.`)
}

if (validatePswi) {
    try {

        if (promoteBundles) {
            var pswiBundle = searchArtifact(
                `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-PSWI-*.pax.Z.bundle']}`
            )
            if (pswiBundle['path']) {
                releaseArtifacts['pswi-bundle'] = {}
                releaseArtifacts['pswi-bundle']['source'] = pswiBundle
                releaseArtifacts['pswi-bundle']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-PSWI-*.pax.Z.bundle'].replace(/\*/g, releaseVersion)
                logValidate(`>>[validate 17/17]>> Found PSWI ${releaseArtifacts['pswi-bundle']['source']['path']}.`)
            }
        }

        // get PSWI build artifacts
        var pswi = searchArtifact(
            `${zoweReleaseJsonObject['zowe']['from']}/${zoweReleaseJsonObject['zowe']['sourcePath']}/${zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-PSWI-*.pax.Z']}`
        )
        if (pswi['path']) {
            releaseArtifacts['pswi'] = {}
            releaseArtifacts['pswi']['source'] = pswi
            releaseArtifacts['pswi']['target'] = zoweReleaseJsonObject['zowe']['sourceFiles']['zowe-PSWI-*.pax.Z'].replace(/\*/g, releaseVersion)
            logValidate(`>>[validate 17/17]>> Found PSWI ${releaseArtifacts['pswi']['source']['path']}.`)
        }
    } 
    catch (e1) {
        throw new Error('>>> no PSWI found in the build.')
    }
}
else {
    logSkipValidate(`>>[validate 17/17]>> Manually skipped Zowe PSWI.`)
}

// write to file and print content, this file will be used in promote step in workflow
var promoteJsonFileNameFull = process.env.RUNNER_TEMP + '/promote-artifacts.json'
core.setOutput('PROMOTE_JSON_FILE_NAME_FULL', promoteJsonFileNameFull)
fs.writeFileSync(promoteJsonFileNameFull, JSON.stringify(releaseArtifacts, null, 2))

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

function searchFolder(pattern) {
    var cmd = `jfrog rt search --sort-by=created --sort-order=desc ${pattern} | jq -r '.[]'`
    debug(`searchFolder full command: ${cmd}`)
    var out = utils.sh(cmd)
    if (!out || out == null || out == '') {
        return
    }
    else {
        return JSON.parse(out)
    }
}

function searchArtifact(pattern, buildName, buildNum) {
    if ((buildName == '' && buildNum != '') || (buildName != '' && buildNum == '')) {
        throw new Error('Function searchArtifact must have neither buildName or buildNum, or have both')
    }
    var cmd = `jfrog rt search`
    if (buildName && buildNum) {
        cmd += ` --build="${buildName}/${buildNum}"`
    }
    else {
        // if no buildNumber and buildNum, will search latest, ignoring those two inputs
        cmd += ` --sort-by=created --sort-order=desc --limit=1`
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
    console.log('\x1b[32m%s\x1b[0m', msg)
}

function logSkipValidate(msg) {
    console.log('\x1b[33m%s\x1b[0m', msg)
}