/*
===========================================================
DB SPACE - GitHub File Storage
GitHub App Device Flow Authentication
===========================================================
*/


// =========================================================
// GITHUB CONFIGURATION
// =========================================================

const GITHUB_OWNER = "elabnpd";

const GITHUB_REPO = "DB_SPACE";

const GITHUB_BRANCH = "main";

const GITHUB_FOLDER = "files";


// ---------------------------------------------------------
// IMPORTANT
// ---------------------------------------------------------
//
// Put your GitHub APP CLIENT ID here.
//
// Example:
//
// const GITHUB_CLIENT_ID = "Iv1.xxxxxxxxxxxxx";
//
// DO NOT put:
//
// - github_pat_...
// - client secret
// - private key
//
// in this file.
// ---------------------------------------------------------

const GITHUB_CLIENT_ID =
    "Iv23liuJ6PzKlCSkbWpL";


const API_BASE =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;


// =========================================================
// STORAGE KEYS
// =========================================================

const ACCESS_TOKEN_KEY =
    "db_space_github_access_token";

const REFRESH_TOKEN_KEY =
    "db_space_github_refresh_token";

const TOKEN_EXPIRY_KEY =
    "db_space_github_token_expiry";


// =========================================================
// TOKEN
// =========================================================

let githubToken =
    sessionStorage.getItem(ACCESS_TOKEN_KEY);


// =========================================================
// GITHUB HEADERS
// =========================================================

function getGitHubHeaders() {

    return {

        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${githubToken}`,

        "X-GitHub-Api-Version":
            "2022-11-28"

    };
}


// =========================================================
// PAGE LOAD
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        updateUI();

        if (githubToken) {

            const valid =
                await validateToken();

            if (valid) {

                await loadUser();

                await loadFiles();

            } else {

                clearToken();

                updateUI();

            }

        }

    }
);


// =========================================================
// LOGIN WITH GITHUB
// =========================================================

async function loginWithGitHub() {

    if (
        !GITHUB_CLIENT_ID ||
        GITHUB_CLIENT_ID ===
        "YOUR_GITHUB_APP_CLIENT_ID"
    ) {

        showStatus(
            "Please add your GitHub App Client ID in app.js first.",
            "error"
        );

        return;
    }


    try {

        showStatus(
            "Connecting to GitHub...",
            "info"
        );


        const response = await fetch(
            `https://github.com/login/device/code?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}`,
            {
                method: "POST",

                headers: {
                    "Accept":
                        "application/json",

                    "Content-Type":
                        "application/json"
                }
            }
        );


        const data =
            await safeJson(response);


        if (!response.ok) {

            throw new Error(
                data.error_description ||
                data.error ||
                `GitHub error ${response.status}`
            );
        }


        const deviceCode =
            data.device_code;

        const userCode =
            data.user_code;

        const verificationUri =
            data.verification_uri;

        const interval =
            Number(data.interval || 5);

        const expiresIn =
            Number(data.expires_in || 900);


        if (!deviceCode || !userCode) {

            throw new Error(
                "GitHub did not return a device code."
            );
        }


        document.getElementById(
            "deviceLogin"
        ).style.display = "block";


        document.getElementById(
            "deviceCode"
        ).textContent = userCode;


        document.getElementById(
            "deviceUrl"
        ).href = verificationUri;


        showStatus(
            "Enter the displayed code on GitHub.",
            "info"
        );


        // Open GitHub automatically
        window.open(
            verificationUri,
            "_blank"
        );


        await pollForToken(
            deviceCode,
            interval,
            expiresIn
        );


    } catch (error) {

        console.error(
            "GitHub login error:",
            error
        );


        showStatus(
            "GitHub login failed: " +
            error.message,
            "error"
        );

    }

}


// =========================================================
// DEVICE FLOW POLLING
// =========================================================

async function pollForToken(
    deviceCode,
    interval,
    expiresIn
) {

    const startTime =
        Date.now();


    while (
        Date.now() - startTime <
        expiresIn * 1000
    ) {


        await sleep(
            interval * 1000
        );


        const params =
            new URLSearchParams({

                client_id:
                    GITHUB_CLIENT_ID,

                device_code:
                    deviceCode,

                grant_type:
                    "urn:ietf:params:oauth:grant-type:device_code"

            });


        try {

            const response =
                await fetch(
                    `https://github.com/login/oauth/access_token?${params.toString()}`,
                    {
                        method: "POST",

                        headers: {
                            "Accept":
                                "application/json",

                            "Content-Type":
                                "application/json"
                        }
                    }
                );


            const data =
                await safeJson(response);


            // -------------------------------------------------
            // SUCCESS
            // -------------------------------------------------

            if (
                response.ok &&
                data.access_token
            ) {

                githubToken =
                    data.access_token;


                sessionStorage.setItem(
                    ACCESS_TOKEN_KEY,
                    githubToken
                );


                // Save refresh token if supplied
                if (data.refresh_token) {

                    sessionStorage.setItem(
                        REFRESH_TOKEN_KEY,
                        data.refresh_token
                    );

                }


                // Save expiry
                if (data.expires_in) {

                    const expiry =
                        Date.now() +
                        Number(data.expires_in) * 1000;

                    sessionStorage.setItem(
                        TOKEN_EXPIRY_KEY,
                        String(expiry)
                    );

                }


                document.getElementById(
                    "deviceLogin"
                ).style.display = "none";


                showStatus(
                    "✅ GitHub login successful.",
                    "success"
                );


                updateUI();


                const user =
                    await loadUser();


                if (!user) {

                    throw new Error(
                        "Unable to verify GitHub account."
                    );

                }


                await loadFiles();


                return;

            }


            // -------------------------------------------------
            // WAITING FOR USER
            // -------------------------------------------------

            if (
                data.error ===
                "authorization_pending"
            ) {

                showStatus(
                    "Waiting for GitHub authorization...",
                    "info"
                );

                continue;

            }


            // -------------------------------------------------
            // SLOW DOWN
            // -------------------------------------------------

            if (
                data.error ===
                "slow_down"
            ) {

                interval += 5;

                showStatus(
                    "GitHub requested slower polling...",
                    "info"
                );

                continue;

            }


            // -------------------------------------------------
            // EXPIRED
            // -------------------------------------------------

            if (
                data.error ===
                "expired_token"
            ) {

                throw new Error(
                    "The GitHub verification code expired. Please try Login again."
                );

            }


            // -------------------------------------------------
            // DENIED
            // -------------------------------------------------

            if (
                data.error ===
                "access_denied"
            ) {

                throw new Error(
                    "GitHub authorization was cancelled."
                );

            }


            // -------------------------------------------------
            // OTHER ERROR
            // -------------------------------------------------

            if (data.error) {

                throw new Error(
                    data.error_description ||
                    data.error
                );

            }

        } catch (error) {

            throw error;

        }

    }


    throw new Error(
        "GitHub login timed out. Please try again."
    );

}


// =========================================================
// VALIDATE TOKEN
// =========================================================

async function validateToken() {

    if (!githubToken) {
        return false;
    }


    try {

        const response =
            await fetch(
                "https://api.github.com/user",
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        if (!response.ok) {

            return false;

        }


        return true;


    } catch (error) {

        console.error(
            "Token validation error:",
            error
        );

        return false;

    }

}


// =========================================================
// LOAD USER
// =========================================================

async function loadUser() {

    try {

        const response =
            await fetch(
                "https://api.github.com/user",
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        const data =
            await safeJson(response);


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to get GitHub user."
            );

        }


        const userInfo =
            document.getElementById(
                "userInfo"
            );


        const username =
            document.getElementById(
                "username"
            );


        const avatar =
            document.getElementById(
                "userAvatar"
            );


        username.textContent =
            data.login;


        avatar.src =
            data.avatar_url;


        userInfo.style.display =
            "flex";


        return data;


    } catch (error) {

        console.error(
            "User loading error:",
            error
        );


        return null;

    }

}


// =========================================================
// LOAD FILES
// =========================================================

async function loadFiles() {

    if (!githubToken) {
        return;
    }


    const loading =
        document.getElementById(
            "loading"
        );


    const fileList =
        document.getElementById(
            "fileList"
        );


    const table =
        document.getElementById(
            "fileTable"
        );


    loading.style.display =
        "block";


    table.style.display =
        "none";


    fileList.innerHTML =
        "";


    try {

        const response =
            await fetch(
                `${API_BASE}/contents/${encodeURIComponent(GITHUB_FOLDER)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        const data =
            await safeJson(response);


        if (
            response.status === 404
        ) {

            loading.textContent =
                "No files uploaded yet.";

            return;

        }


        if (!response.ok) {

            throw new Error(
                data.message ||
                `GitHub error ${response.status}`
            );

        }


        const files =
            Array.isArray(data)
                ? data.filter(
                    item =>
                        item.type === "file"
                )
                : [];


        loading.style.display =
            "none";


        table.style.display =
            "table";


        if (files.length === 0) {

            fileList.innerHTML = `
                <tr>
                    <td
                        colspan="4"
                        class="empty"
                    >
                        No files found.
                    </td>
                </tr>
            `;

            return;

        }


        files.forEach(
            file => {

                const row =
                    document.createElement(
                        "tr"
                    );


                const encodedName =
                    encodeURIComponent(
                        file.name
                    );


                row.innerHTML = `

                    <td>
                        📄
                        ${escapeHtml(file.name)}
                    </td>

                    <td>
                        ${formatBytes(file.size)}
                    </td>

                    <td>
                        ${file.updated_at
                            ? new Date(
                                file.updated_at
                            ).toLocaleString()
                            : "-"
                        }
                    </td>

                    <td>

                        <button
                            class="action-button download-button"
                            onclick="downloadFile('${encodedName}')"
                        >
                            Download
                        </button>

                        <button
                            class="action-button delete-button"
                            onclick="deleteFile('${encodedName}')"
                        >
                            Delete
                        </button>

                    </td>

                `;


                fileList.appendChild(row);

            }
        );


    } catch (error) {

        console.error(
            "Load files error:",
            error
        );


        loading.style.display =
            "none";


        table.style.display =
            "table";


        fileList.innerHTML = `

            <tr>

                <td
                    colspan="4"
                    class="empty"
                >
                    ❌ ${escapeHtml(error.message)}
                </td>

            </tr>

        `;

    }

}


// =========================================================
// FILE SELECT
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const fileInput =
            document.getElementById(
                "fileInput"
            );


        const uploadArea =
            document.getElementById(
                "uploadArea"
            );


        fileInput.addEventListener(
            "change",
            function () {

                if (
                    this.files &&
                    this.files.length > 0
                ) {

                    showSelectedFile(
                        this.files[0]
                    );

                }

            }
        );


        // Drag and drop

        uploadArea.addEventListener(
            "dragover",
            function (event) {

                event.preventDefault();

                uploadArea.classList.add(
                    "dragover"
                );

            }
        );


        uploadArea.addEventListener(
            "dragleave",
            function () {

                uploadArea.classList.remove(
                    "dragover"
                );

            }
        );


        uploadArea.addEventListener(
            "drop",
            function (event) {

                event.preventDefault();

                uploadArea.classList.remove(
                    "dragover"
                );


                const files =
                    event.dataTransfer.files;


                if (
                    files &&
                    files.length > 0
                ) {

                    fileInput.files =
                        files;

                    showSelectedFile(
                        files[0]
                    );

                }

            }
        );

    }
);


// =========================================================
// SHOW SELECTED FILE
// =========================================================

function showSelectedFile(file) {

    const selected =
        document.getElementById(
            "selectedFile"
        );


    const uploadButton =
        document.getElementById(
            "uploadButton"
        );


    selected.textContent =
        `Selected: ${file.name} (${formatBytes(file.size)})`;


    uploadButton.style.display =
        "inline-block";

}


// =========================================================
// UPLOAD FILE
// =========================================================

async function uploadFile() {

    if (!githubToken) {

        showStatus(
            "Please login with GitHub first.",
            "error"
        );

        return;

    }


    const fileInput =
        document.getElementById(
            "fileInput"
        );


    const file =
        fileInput.files[0];


    if (!file) {

        showStatus(
            "Please select a file.",
            "error"
        );

        return;

    }


    // GitHub Contents API limit
    // approximately 100 MB

    if (
        file.size >
        100 * 1024 * 1024
    ) {

        showStatus(
            "File is larger than 100 MB.",
            "error"
        );

        return;

    }


    const progressContainer =
        document.getElementById(
            "progressContainer"
        );


    const progressFill =
        document.getElementById(
            "progressFill"
        );


    const progressText =
        document.getElementById(
            "progressText"
        );


    try {

        progressContainer.style.display =
            "block";


        progressFill.style.width =
            "10%";


        progressText.textContent =
            "Preparing file...";


        const base64 =
            await fileToBase64(file);


        progressFill.style.width =
            "35%";


        progressText.textContent =
            "Checking existing file...";


        const path =
            `${GITHUB_FOLDER}/${file.name}`;


        // -------------------------------------------------
        // Check whether file already exists
        // -------------------------------------------------

        let existingSha = null;


        const existingResponse =
            await fetch(
                `${API_BASE}/contents/${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        if (existingResponse.ok) {

            const existing =
                await safeJson(
                    existingResponse
                );


            existingSha =
                existing.sha;

        }


        progressFill.style.width =
            "55%";


        progressText.textContent =
            existingSha
                ? "Updating file on GitHub..."
                : "Uploading file to GitHub...";


        const body = {

            message:
                existingSha
                    ? `Update ${file.name}`
                    : `Upload ${file.name}`,

            content:
                base64,

            branch:
                GITHUB_BRANCH

        };


        if (existingSha) {

            body.sha =
                existingSha;

        }


        const uploadResponse =
            await fetch(
                `${API_BASE}/contents/${encodePath(path)}`,
                {
                    method: "PUT",

                    headers: {
                        ...getGitHubHeaders(),

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(body)
                }
            );


        const uploadData =
            await safeJson(
                uploadResponse
            );


        if (!uploadResponse.ok) {

            throw new Error(
                uploadData.message ||
                `GitHub upload error ${uploadResponse.status}`
            );

        }


        progressFill.style.width =
            "100%";


        progressText.textContent =
            "Upload complete.";


        showStatus(
            `✅ ${file.name} uploaded successfully.`,
            "success"
        );


        fileInput.value = "";


        document.getElementById(
            "selectedFile"
        ).textContent = "";


        document.getElementById(
            "uploadButton"
        ).style.display = "none";


        await loadFiles();


        setTimeout(
            function () {

                progressContainer.style.display =
                    "none";

                progressFill.style.width =
                    "0%";

            },
            1500
        );


    } catch (error) {

        console.error(
            "Upload error:",
            error
        );


        progressContainer.style.display =
            "none";


        showStatus(
            `❌ Upload failed: ${error.message}`,
            "error"
        );

    }

}


// =========================================================
// DOWNLOAD FILE
// =========================================================

async function downloadFile(
    encodedName
) {

    if (!githubToken) {

        showStatus(
            "Please login with GitHub first.",
            "error"
        );

        return;

    }


    const fileName =
        decodeURIComponent(
            encodedName
        );


    try {

        showStatus(
            `Downloading ${fileName}...`,
            "info"
        );


        const path =
            `${GITHUB_FOLDER}/${fileName}`;


        const response =
            await fetch(
                `${API_BASE}/contents/${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        const data =
            await safeJson(
                response
            );


        if (!response.ok) {

            throw new Error(
                data.message ||
                `GitHub error ${response.status}`
            );

        }


        if (!data.content) {

            throw new Error(
                "GitHub did not return file content."
            );

        }


        const binary =
            atob(
                data.content.replace(
                    /\s/g,
                    ""
                )
            );


        const bytes =
            new Uint8Array(
                binary.length
            );


        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            bytes[i] =
                binary.charCodeAt(i);

        }


        const blob =
            new Blob(
                [bytes],
                {
                    type:
                        "application/octet-stream"
                }
            );


        const url =
            URL.createObjectURL(blob);


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            fileName;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
            url
        );


        showStatus(
            `✅ ${fileName} downloaded.`,
            "success"
        );


    } catch (error) {

        console.error(
            "Download error:",
            error
        );


        showStatus(
            `❌ Download failed: ${error.message}`,
            "error"
        );

    }

}


// =========================================================
// DELETE FILE
// =========================================================

async function deleteFile(
    encodedName
) {

    if (!githubToken) {

        showStatus(
            "Please login with GitHub first.",
            "error"
        );

        return;

    }


    const fileName =
        decodeURIComponent(
            encodedName
        );


    if (
        !confirm(
            `Delete "${fileName}"?`
        )
    ) {

        return;

    }


    try {

        showStatus(
            `Deleting ${fileName}...`,
            "info"
        );


        const path =
            `${GITHUB_FOLDER}/${fileName}`;


        // Get current SHA

        const getResponse =
            await fetch(
                `${API_BASE}/contents/${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
                {
                    headers:
                        getGitHubHeaders()
                }
            );


        const fileData =
            await safeJson(
                getResponse
            );


        if (!getResponse.ok) {

            throw new Error(
                fileData.message ||
                `GitHub error ${getResponse.status}`
            );

        }


        const deleteResponse =
            await fetch(
                `${API_BASE}/contents/${encodePath(path)}`,
                {
                    method: "DELETE",

                    headers: {
                        ...getGitHubHeaders(),

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            message:
                                `Delete ${fileName}`,

                            sha:
                                fileData.sha,

                            branch:
                                GITHUB_BRANCH

                        })
                }
            );


        const deleteData =
            await safeJson(
                deleteResponse
            );


        if (!deleteResponse.ok) {

            throw new Error(
                deleteData.message ||
                `GitHub delete error ${deleteResponse.status}`
            );

        }


        showStatus(
            `✅ ${fileName} deleted.`,
            "success"
        );


        await loadFiles();


    } catch (error) {

        console.error(
            "Delete error:",
            error
        );


        showStatus(
            `❌ Delete failed: ${error.message}`,
            "error"
        );

    }

}


// =========================================================
// LOGOUT
// =========================================================

function logoutGitHub() {

    clearToken();

    updateUI();

    showStatus(
        "You have been logged out.",
        "info"
    );

}


// =========================================================
// CLEAR TOKEN
// =========================================================

function clearToken() {

    githubToken =
        null;


    sessionStorage.removeItem(
        ACCESS_TOKEN_KEY
    );


    sessionStorage.removeItem(
        REFRESH_TOKEN_KEY
    );


    sessionStorage.removeItem(
        TOKEN_EXPIRY_KEY
    );

}


// =========================================================
// UPDATE UI
// =========================================================

function updateUI() {

    const loginButton =
        document.getElementById(
            "loginButton"
        );


    const logoutButton =
        document.getElementById(
            "logoutButton"
        );


    const loginCard =
        document.getElementById(
            "loginCard"
        );


    const appContent =
        document.getElementById(
            "appContent"
        );


    const userInfo =
        document.getElementById(
            "userInfo"
        );


    if (githubToken) {

        loginButton.style.display =
            "none";


        logoutButton.style.display =
            "inline-block";


        loginCard.style.display =
            "none";


        appContent.style.display =
            "block";


        userInfo.style.display =
            "flex";

    } else {

        loginButton.style.display =
            "inline-block";


        logoutButton.style.display =
            "none";


        loginCard.style.display =
            "block";


        appContent.style.display =
            "none";


        userInfo.style.display =
            "none";

    }

}


// =========================================================
// FILE → BASE64
// =========================================================

function fileToBase64(file) {

    return new Promise(
        function (resolve, reject) {

            const reader =
                new FileReader();


            reader.onload =
                function () {

                    const result =
                        reader.result;


                    const commaIndex =
                        result.indexOf(",");


                    resolve(
                        result.substring(
                            commaIndex + 1
                        )
                    );

                };


            reader.onerror =
                function () {

                    reject(
                        new Error(
                            "Could not read file."
                        )
                    );

                };


            reader.readAsDataURL(
                file
            );

        }
    );

}


// =========================================================
// ENCODE PATH
// =========================================================
//
// Encode every path segment individually.
// This allows filenames containing spaces,
// #, %, &, etc.
//

function encodePath(path) {

    return path
        .split("/")
        .map(
            part =>
                encodeURIComponent(part)
        )
        .join("/");

}


// =========================================================
// SAFE JSON
// =========================================================

async function safeJson(response) {

    const text =
        await response.text();


    if (!text) {
        return {};
    }


    try {

        return JSON.parse(text);

    } catch {

        return {
            message:
                text
        };

    }

}


// =========================================================
// FORMAT BYTES
// =========================================================

function formatBytes(bytes) {

    if (
        bytes === 0 ||
        bytes === undefined
    ) {

        return "0 B";

    }


    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        parseFloat(
            (
                bytes /
                Math.pow(
                    1024,
                    index
                )
            ).toFixed(2)
        ) +
        " " +
        units[index]
    );

}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;

}


// =========================================================
// STATUS MESSAGE
// =========================================================

function showStatus(
    message,
    type
) {

    const status =
        document.getElementById(
            "status"
        );


    status.textContent =
        message;


    status.className =
        `status ${type}`;

}


// =========================================================
// SLEEP
// =========================================================

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}