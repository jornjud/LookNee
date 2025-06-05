// script.js

// Read potentially injected global variables first to avoid TDZ issues.
// These might be provided by the Canvas environment or other external sources.
// Default values are used if the global variables are not defined.
const EFFECTIVE_APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'looknee-2cb81';
const EFFECTIVE_INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// User-provided Firebase config (ensure this is correct for your project)
const firebaseConfig = {
    apiKey: "AIzaSyA3bTaumvBXrdKAPAEeJJ7mfJAV_35PJZc",
    authDomain: "looknee-2cb81.firebaseapp.com",
    projectId: "looknee-2cb81",
    storageBucket: "looknee-2cb81.appspot.com", // Ensure this is your correct storage bucket
    messagingSenderId: "41415066815",
    appId: "1:41415066815:web:78569d85b881cae371b20a"
};

// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    signInAnonymously,
    signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    query,
    // where, // 'where' is not used in the current version, can be removed if not planned.
    onSnapshot,
    serverTimestamp,
    updateDoc // 'updateDoc' is not used in current version, can be removed if not planned for updates.
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js"; // Storage not used yet.

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// const storage = getStorage(app); // Initialize storage if/when needed

// --- Global Application State Variables ---
let userId = null; // Stores the current user's ID
let debtorsListener = null; // Firestore listener for debtors, allows unsubscribing
let debtorsCache = []; // Local cache of debtor data for quick filtering/sorting
let paymentListener = null; // Firestore listener for payments of a specific debtor
let currentDebtorIdForPayment = null; // Tracks which debtor's payments are being viewed/added

// --- DOM Element References ---
// It's good practice to ensure the DOM is loaded before trying to access elements.
// Since this script is loaded with 'defer', the DOM should be ready.
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutButton = document.getElementById('logoutButton');
const currentUserIdDisplay = document.getElementById('currentUserIdDisplay');

const addDebtorButton = document.getElementById('addDebtorButton');
const debtorModal = document.getElementById('debtorModal');
const debtorForm = document.getElementById('debtorForm');
const debtorModalTitle = document.getElementById('debtorModalTitle');
const cancelDebtorModal = document.getElementById('cancelDebtorModal');
const closeDebtorModalUpper = document.getElementById('closeDebtorModalUpper');
const debtorTableBody = document.getElementById('debtorTableBody');
const searchInput = document.getElementById('searchInput');
const sortBySelect = document.getElementById('sortBySelect');

const dashboardSection = document.getElementById('dashboardSection');
const totalDebtorsStat = document.getElementById('totalDebtorsStat');
const totalDebtAmountStat = document.getElementById('totalDebtAmountStat');
const totalPaidAmountStat = document.getElementById('totalPaidAmountStat');

const calendarView = document.getElementById('calendarView');
const exportCsvButton = document.getElementById('exportCsvButton');

const paymentHistoryModal = document.getElementById('paymentHistoryModal');
const paymentHistoryContent = document.getElementById('paymentHistoryContent');
const closePaymentHistoryModal = document.getElementById('closePaymentHistoryModal');
const closePaymentHistoryModalUpper = document.getElementById('closePaymentHistoryModalUpper');
const addPaymentForm = document.getElementById('addPaymentForm');
const paymentModalTitle = document.getElementById('paymentModalTitle');

const messageContainer = document.getElementById('messageContainer');

// --- Custom Confirm Modal Elements (Dynamically created, but IDs are used) ---
// These will be created by createCustomConfirmModal function
let confirmModalElement, customConfirmMessageEl, customConfirmOkButton, customConfirmCancelButton;


// --- Utility Functions ---

/**
 * Displays a temporary message to the user.
 * @param {string} message - The message to display.
 * @param {string} type - 'success' or 'error' to style the message.
 */
function showMessage(message, type = 'success') {
    if (!messageContainer) {
        console.error("Message container not found!");
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `p-4 mb-4 text-sm rounded-lg ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    messageDiv.setAttribute('role', 'alert');
    messageDiv.textContent = message;
    messageContainer.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

/**
 * Constructs the Firestore collection path for a user's debtors.
 * @returns {string|null} The collection path or null if userId is not set.
 */
function getDebtorCollectionPath() {
    if (!userId) {
        console.error("User ID not available for Firestore path. Cannot get debtor collection.");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors`;
}

/**
 * Constructs the Firestore collection path for payments of a specific debtor.
 * @param {string} debtorId - The ID of the debtor.
 * @returns {string|null} The collection path or null if IDs are missing.
 */
function getPaymentsCollectionPath(debtorId) {
     if (!userId || !debtorId) {
        console.error("User ID or Debtor ID not available for Firestore path. Cannot get payments collection.");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors/${debtorId}/payments`;
}

/**
 * Creates and appends the custom confirm modal to the body.
 */
function createCustomConfirmModal() {
    if (document.getElementById('customConfirmModal')) return; // Already created

    confirmModalElement = document.createElement('div');
    confirmModalElement.id = 'customConfirmModal';
    confirmModalElement.className = 'modal fixed inset-0 bg-gray-800 bg-opacity-60 overflow-y-auto h-full w-full items-center justify-center p-4';
    confirmModalElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-sm mx-auto p-6 space-y-4">
            <p id="customConfirmMessage" class="text-gray-700 text-center"></p>
            <div class="flex justify-center space-x-4">
                <button id="customConfirmOk" class="btn btn-primary">ตกลง</button>
                <button id="customConfirmCancel" class="btn btn-secondary">ยกเลิก</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModalElement);

    customConfirmMessageEl = document.getElementById('customConfirmMessage');
    customConfirmOkButton = document.getElementById('customConfirmOk');
    customConfirmCancelButton = document.getElementById('customConfirmCancel');
}

/**
 * Shows a custom confirmation dialog.
 * @param {string} message - The message to display in the confirmation dialog.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
 */
function showCustomConfirm(message) {
    if (!confirmModalElement || !customConfirmMessageEl || !customConfirmOkButton || !customConfirmCancelButton) {
        console.error("Custom confirm modal elements not initialized.");
        return Promise.resolve(false); // Fallback, or throw error
    }
    return new Promise((resolve) => {
        customConfirmMessageEl.textContent = message;
        confirmModalElement.classList.add('active');

        // Remove previous listeners to avoid multiple resolves
        const newOkButton = customConfirmOkButton.cloneNode(true);
        customConfirmOkButton.parentNode.replaceChild(newOkButton, customConfirmOkButton);
        customConfirmOkButton = newOkButton;

        const newCancelButton = customConfirmCancelButton.cloneNode(true);
        customConfirmCancelButton.parentNode.replaceChild(newCancelButton, customConfirmCancelButton);
        customConfirmCancelButton = newCancelButton;

        customConfirmOkButton.onclick = () => {
            confirmModalElement.classList.remove('active');
            resolve(true);
        };
        customConfirmCancelButton.onclick = () => {
            confirmModalElement.classList.remove('active');
            resolve(false);
        };
    });
}


// --- Authentication Logic ---

/**
 * Handles changes in the user's authentication state.
 * Shows/hides UI sections and loads data accordingly.
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        console.log("User logged in:", userId);
        if (userEmailDisplay) userEmailDisplay.textContent = user.email || 'Anonymous User';
        if (currentUserIdDisplay) currentUserIdDisplay.textContent = `User ID: ${userId}`;
        if (authSection) authSection.style.display = 'none';
        if (appSection) appSection.style.display = 'block';

        const currentSearchTerm = searchInput ? searchInput.value : '';
        const currentSortBy = sortBySelect ? sortBySelect.value : 'name_asc';
        loadDebtors(currentSearchTerm, currentSortBy);
        updateDashboard(); // Initial dashboard update after login
    } else {
        userId = null;
        console.log("User logged out or not logged in.");
        if (userEmailDisplay) userEmailDisplay.textContent = '';
        if (currentUserIdDisplay) currentUserIdDisplay.textContent = '';
        if (authSection) authSection.style.display = 'flex';
        if (appSection) appSection.style.display = 'none';
        if (debtorsListener) {
            debtorsListener(); // Unsubscribe from Firestore listener
            debtorsListener = null;
        }
        if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>';
        debtorsCache = [];
        // Also clear dashboard stats on logout
        if (totalDebtorsStat) totalDebtorsStat.textContent = '0';
        if (totalDebtAmountStat) totalDebtAmountStat.textContent = '0.00 บาท';
        if (totalPaidAmountStat) totalPaidAmountStat.textContent = '0.00 บาท';
        if (calendarView) calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>';
    }
});

/**
 * Attempts to sign in the user, either with a custom token (if provided)
 * or anonymously as a fallback.
 */
async function attemptInitialSignIn() {
    try {
        if (EFFECTIVE_INITIAL_AUTH_TOKEN) {
            console.log("Attempting sign in with custom token.");
            await signInWithCustomToken(auth, EFFECTIVE_INITIAL_AUTH_TOKEN);
        } else {
            console.log("No custom token found, attempting anonymous sign in.");
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Error during initial sign in:", error);
        showMessage(`เกิดข้อผิดพลาดในการเข้าสู่ระบบเบื้องต้น: ${error.message}`, 'error');
        // Potentially show a more user-friendly error in the UI if auth is critical
    }
}

// --- Auth Form Event Listeners ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showMessage('เข้าสู่ระบบสำเร็จ!', 'success');
            loginForm.reset();
        } catch (error) {
            console.error("Login error:", error);
            showMessage(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`, 'error');
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = registerForm.email.value;
        const password = registerForm.password.value;
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            showMessage('ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ', 'success');
            registerForm.reset();
            showLogin(); // Switch to login form after successful registration
        } catch (error) {
            console.error("Register error:", error);
            showMessage(`ลงทะเบียนไม่สำเร็จ: ${error.message}`, 'error');
        }
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showMessage('ออกจากระบบแล้ว', 'success');
        } catch (error) {
            console.error("Logout error:", error);
            showMessage(`ออกจากระบบไม่สำเร็จ: ${error.message}`, 'error');
        }
    });
}

function showRegister() {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
}
function showLogin() {
    if (registerForm) registerForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
}

if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });


// --- Debtor Management Logic ---

/**
 * Opens the debtor modal for adding a new debtor.
 */
if (addDebtorButton) {
    addDebtorButton.addEventListener('click', () => {
        if (debtorModal) debtorModal.classList.add('active');
        if (debtorModalTitle) debtorModalTitle.textContent = 'เพิ่มลูกหนี้ใหม่';
        if (debtorForm) {
            debtorForm.reset(); // Clear form fields
            debtorForm.dataset.mode = 'add'; // Set mode to 'add'
            delete debtorForm.dataset.id; // Remove any existing debtor ID
        }
    });
}

/**
 * Closes the debtor modal.
 */
function closeDebtorModalAction() {
    if (debtorModal) debtorModal.classList.remove('active');
}
if (cancelDebtorModal) cancelDebtorModal.addEventListener('click', closeDebtorModalAction);
if (closeDebtorModalUpper) closeDebtorModalUpper.addEventListener('click', closeDebtorModalAction);


/**
 * Handles submission of the debtor form (add or edit).
 */
if (debtorForm) {
    debtorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userId) {
            showMessage('คุณต้องเข้าสู่ระบบก่อนทำการบันทึก', 'error');
            return;
        }

        const debtorData = {
            name: debtorForm.debtorName.value.trim(),
            contact: debtorForm.debtorContact.value.trim(),
            amount: parseFloat(debtorForm.debtorAmount.value),
            currency: debtorForm.debtorCurrency.value,
            dateBorrowed: debtorForm.debtorDateBorrowed.value,
            dateDue: debtorForm.debtorDateDue.value,
            status: debtorForm.debtorStatus.value,
            notes: debtorForm.debtorNotes.value.trim(),
            lastUpdated: serverTimestamp() // Firestore server timestamp
        };

        // Basic validation
        if (!debtorData.name || !debtorData.amount || !debtorData.dateBorrowed || !debtorData.dateDue) {
            showMessage('กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน', 'error');
            return;
        }

        const debtorCollectionPath = getDebtorCollectionPath();
        if (!debtorCollectionPath) return; // Error already shown by getDebtorCollectionPath

        try {
            if (debtorForm.dataset.mode === 'add') {
                await addDoc(collection(db, debtorCollectionPath), debtorData);
                showMessage('เพิ่มลูกหนี้สำเร็จ!', 'success');
            } else {
                const debtorId = debtorForm.dataset.id;
                if (!debtorId) {
                    showMessage('ไม่พบ ID ลูกหนี้สำหรับการแก้ไข', 'error');
                    return;
                }
                await setDoc(doc(db, debtorCollectionPath, debtorId), debtorData, { merge: true });
                showMessage('แก้ไขข้อมูลลูกหนี้สำเร็จ!', 'success');
            }
            closeDebtorModalAction();
            debtorForm.reset();
            // Data will be re-rendered by onSnapshot listener
        } catch (error) {
            console.error("Error saving debtor:", error);
            showMessage(`เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกหนี้: ${error.message}`, 'error');
        }
    });
}

/**
 * Loads debtors from Firestore and sets up a real-time listener.
 * @param {string} searchTerm - Optional term to filter debtors by.
 * @param {string} sortBy - Optional field and order to sort by.
 */
async function loadDebtors(searchTerm = '', sortBy = 'name_asc') {
    if (!userId) {
        if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>';
        return;
    }
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;

    if (debtorsListener) debtorsListener(); // Unsubscribe from any previous listener

    const q = query(collection(db, debtorCollectionPath)); // No server-side ordering, will sort client-side

    if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูลลูกหนี้...</td></tr>';


    debtorsListener = onSnapshot(q, (querySnapshot) => {
        debtorsCache = [];
        querySnapshot.forEach((doc) => {
            debtorsCache.push({ id: doc.id, ...doc.data() });
        });
        // Use the current values from the input fields for rendering
        const currentSearchTerm = searchInput ? searchInput.value : '';
        const currentSortBy = sortBySelect ? sortBySelect.value : 'name_asc';
        renderDebtors(currentSearchTerm, currentSortBy);
        updateDashboard();
        renderCalendar();
    }, (error) => {
        console.error("Error loading debtors:", error);
        showMessage(`เกิดข้อผิดพลาดในการโหลดข้อมูลลูกหนี้: ${error.message}`, 'error');
        if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลลูกหนี้ได้</td></tr>';
    });
}

/**
 * Renders the list of debtors in the HTML table.
 * Applies filtering and sorting based on cached data.
 * @param {string} searchTerm - Term to filter debtors by name or contact.
 * @param {string} sortBy - Field and order to sort debtors by (e.g., 'name_asc').
 */
function renderDebtors(searchTerm = '', sortBy = 'name_asc') {
    if (!debtorTableBody) return;
    debtorTableBody.innerHTML = ''; // Clear existing rows

    let filteredDebtors = [...debtorsCache];

    // Filter based on search term (case-insensitive)
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredDebtors = filteredDebtors.filter(debtor =>
            debtor.name.toLowerCase().includes(lowerSearchTerm) ||
            (debtor.contact && debtor.contact.toLowerCase().includes(lowerSearchTerm))
        );
    }

    // Sort based on sortBy parameter
    const [sortField, sortOrder] = sortBy.split('_');
    filteredDebtors.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Type-specific comparisons
        if (sortField === 'amount') {
            valA = parseFloat(valA || 0); // Handle potential undefined or null
            valB = parseFloat(valB || 0);
        } else if (sortField === 'dateBorrowed' || sortField === 'dateDue') {
            valA = new Date(valA);
            valB = new Date(valB);
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        // Add more type checks if other fields are sortable

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    if (filteredDebtors.length === 0) {
        debtorTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-gray-500">ยังไม่มีข้อมูลลูกหนี้${searchTerm ? 'ที่ตรงกับคำค้นหา' : ''}</td></tr>`;
        return;
    }

    filteredDebtors.forEach(debtor => {
        const row = debtorTableBody.insertRow();
        row.className = 'bg-white hover:bg-gray-50 transition-colors duration-150';
        const today = new Date().toISOString().split('T')[0]; // For date comparison
        let statusColor = 'text-gray-700'; // Default color
        if (debtor.status === 'จ่ายแล้ว') {
            statusColor = 'text-green-600 font-semibold';
        } else if (debtor.status === 'ยังไม่จ่าย' && debtor.dateDue && debtor.dateDue < today) {
            statusColor = 'text-red-600 font-semibold'; // Overdue
        } else if (debtor.status === 'ยังไม่จ่าย' && debtor.dateDue && debtor.dateDue === today) {
            statusColor = 'text-yellow-600 font-semibold'; // Due today
        }

        const lastUpdatedDate = debtor.lastUpdated?.toDate ? new Date(debtor.lastUpdated.toDate()).toLocaleString('th-TH') : 'N/A';
        const amountDisplay = (debtor.amount || 0).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});


        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${debtor.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${debtor.contact || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">${amountDisplay} ${debtor.currency || 'THB'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${debtor.dateBorrowed || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${debtor.dateDue || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${statusColor}">${debtor.status || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title="${debtor.notes || ''}">${debtor.notes || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${lastUpdatedDate}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-1">
                <button class="btn-icon text-indigo-600 hover:text-indigo-900 edit-debtor" data-id="${debtor.id}" title="แก้ไขข้อมูลลูกหนี้"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-red-600 hover:text-red-900 delete-debtor" data-id="${debtor.id}" title="ลบลูกหนี้"><i class="fas fa-trash"></i></button>
                <button class="btn-icon text-blue-600 hover:text-blue-900 view-payments" data-id="${debtor.id}" data-name="${debtor.name}" title="ดู/เพิ่มประวัติการชำระเงิน"><i class="fas fa-history"></i></button>
            </td>
        `;
    });
    attachActionListenersToDebtorRows(); // Re-attach listeners to new rows
}

/**
 * Attaches event listeners to action buttons (edit, delete, view payments) in debtor rows.
 */
function attachActionListenersToDebtorRows() {
    document.querySelectorAll('.edit-debtor').forEach(button => {
        // Remove old listener before adding new one to prevent duplicates if function is called multiple times
        button.replaceWith(button.cloneNode(true));
        document.querySelector(`[data-id='${button.dataset.id}'].edit-debtor`).addEventListener('click', handleEditDebtor);
    });

    document.querySelectorAll('.delete-debtor').forEach(button => {
        button.replaceWith(button.cloneNode(true));
        document.querySelector(`[data-id='${button.dataset.id}'].delete-debtor`).addEventListener('click', handleDeleteDebtor);
    });

    document.querySelectorAll('.view-payments').forEach(button => {
        button.replaceWith(button.cloneNode(true));
        document.querySelector(`[data-id='${button.dataset.id}'][data-name='${button.dataset.name}'].view-payments`).addEventListener('click', handleViewPayments);
    });
}

async function handleEditDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath || !id) return;

    try {
        const debtorRef = doc(db, debtorCollectionPath, id);
        const debtorSnap = await getDoc(debtorRef);
        if (debtorSnap.exists()) {
            const data = debtorSnap.data();
            if (debtorForm) {
                debtorForm.debtorName.value = data.name || '';
                debtorForm.debtorContact.value = data.contact || '';
                debtorForm.debtorAmount.value = data.amount || 0;
                debtorForm.debtorCurrency.value = data.currency || 'THB';
                debtorForm.debtorDateBorrowed.value = data.dateBorrowed || '';
                debtorForm.debtorDateDue.value = data.dateDue || '';
                debtorForm.debtorStatus.value = data.status || 'ยังไม่จ่าย';
                debtorForm.debtorNotes.value = data.notes || '';

                if (debtorModalTitle) debtorModalTitle.textContent = 'แก้ไขข้อมูลลูกหนี้';
                debtorForm.dataset.mode = 'edit';
                debtorForm.dataset.id = id;
                if (debtorModal) debtorModal.classList.add('active');
            }
        } else {
            showMessage('ไม่พบข้อมูลลูกหนี้ที่ต้องการแก้ไข', 'error');
        }
    } catch (error) {
        console.error("Error fetching debtor for edit:", error);
        showMessage(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    }
}

async function handleDeleteDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath || !id) return;

    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบลูกหนี้รายนี้? การกระทำนี้ไม่สามารถย้อนกลับได้ และจะลบประวัติการชำระเงินทั้งหมดของลูกหนี้รายนี้ด้วย');
    if (confirmed) {
        try {
            // Optional: Delete subcollections (payments) first if they exist
            const paymentsPath = getPaymentsCollectionPath(id);
            if (paymentsPath) {
                const paymentsSnapshot = await getDocs(collection(db, paymentsPath));
                const deletePromises = [];
                paymentsSnapshot.forEach(paymentDoc => {
                    deletePromises.push(deleteDoc(doc(db, paymentsPath, paymentDoc.id)));
                });
                await Promise.all(deletePromises);
                console.log(`Deleted ${deletePromises.length} payment(s) for debtor ${id}`);
            }

            // Then delete the debtor document itself
            await deleteDoc(doc(db, debtorCollectionPath, id));
            showMessage('ลบลูกหนี้และประวัติการชำระเงิน (ถ้ามี) สำเร็จ', 'success');
            // Data re-render will be handled by onSnapshot
        } catch (error) {
            console.error("Error deleting debtor:", error);
            showMessage(`เกิดข้อผิดพลาดในการลบข้อมูล: ${error.message}`, 'error');
        }
    }
}

function handleViewPayments(e) {
    const debtorId = e.currentTarget.dataset.id;
    const debtorName = e.currentTarget.dataset.name;
    openPaymentHistoryModal(debtorId, debtorName);
}


// --- Search and Sort Event Listeners ---
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        renderDebtors(e.target.value, sortBySelect ? sortBySelect.value : 'name_asc');
    });
}
if (sortBySelect) {
    sortBySelect.addEventListener('change', (e) => {
        renderDebtors(searchInput ? searchInput.value : '', e.target.value);
    });
}


// --- Dashboard Logic ---
/**
 * Updates the dashboard statistics based on the current debtorsCache.
 */
async function updateDashboard() {
    if (!userId || !debtorsCache) return; // Ensure user is logged in and cache exists

    if (totalDebtorsStat) totalDebtorsStat.textContent = debtorsCache.length;

    const totalDebt = debtorsCache.reduce((sum, debtor) => {
        return debtor.status !== 'จ่ายแล้ว' ? sum + (parseFloat(debtor.amount) || 0) : sum;
    }, 0);
    if (totalDebtAmountStat) totalDebtAmountStat.textContent = totalDebt.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';

    // Calculate total paid amount by summing up payments from subcollections
    // This can be resource-intensive if there are many debtors and payments.
    // Consider denormalization (storing totalPaid on debtor doc) for larger datasets.
    let totalPaidOverall = 0;
    for (const debtor of debtorsCache) {
         if (debtor.status === 'จ่ายแล้ว') { // If debtor is marked as fully paid, use the principal amount.
            totalPaidOverall += (parseFloat(debtor.amount) || 0);
        } else { // Otherwise, sum up their actual payments.
            const paymentsPath = getPaymentsCollectionPath(debtor.id);
            if (paymentsPath) {
                try {
                    const paymentsSnapshot = await getDocs(collection(db, paymentsPath));
                    paymentsSnapshot.forEach(paymentDoc => {
                        totalPaidOverall += (parseFloat(paymentDoc.data().amountPaid) || 0);
                    });
                } catch (error) {
                    console.error(`Error fetching payments for dashboard for debtor ${debtor.id}:`, error);
                }
            }
        }
    }
    if (totalPaidAmountStat) totalPaidAmountStat.textContent = totalPaidOverall.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
}

// --- Calendar Logic (Basic Implementation) ---
/**
 * Renders a simple list of upcoming due dates in the calendar view.
 */
function renderCalendar() {
    if (!calendarView) return;
    if (!userId) {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>';
        return;
    }

    const upcomingDues = debtorsCache
        .filter(d => d.status !== 'จ่ายแล้ว' && d.dateDue && new Date(d.dateDue) >= new Date())
        .sort((a, b) => new Date(a.dateDue) - new Date(b.dateDue))
        .slice(0, 5); // Display a limited number of upcoming dues

    if (upcomingDues.length > 0) {
        let listHtml = '<ul class="space-y-2 mt-2 pl-4 text-xs">';
        upcomingDues.forEach(debtor => {
            const dueDate = new Date(debtor.dateDue);
            const formattedDate = dueDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            listHtml += `<li class="text-gray-700">🗓️ <span class="font-semibold">${debtor.name}</span> - ครบกำหนด ${formattedDate} (${(debtor.amount || 0).toLocaleString('th-TH')} ${debtor.currency || 'THB'})</li>`;
        });
        listHtml += '</ul>';
        calendarView.innerHTML = listHtml;
    } else if (debtorsCache.length > 0) {
         calendarView.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">ไม่มีลูกหนี้ที่ใกล้ครบกำหนด</p>';
    } else {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">ยังไม่มีข้อมูลลูกหนี้</p>';
    }
}


// --- Export to CSV Logic ---
if (exportCsvButton) {
    exportCsvButton.addEventListener('click', () => {
        if (debtorsCache.length === 0) {
            showMessage('ไม่มีข้อมูลลูกหนี้สำหรับ Export', 'error');
            return;
        }
        let csvContent = "\uFEFF"; // BOM for UTF-8 Excel compatibility
        csvContent += "ชื่อ,ข้อมูลติดต่อ,จำนวนเงิน,สกุลเงิน,วันที่ยืม,วันที่ครบกำหนด,สถานะ,หมายเหตุ\n"; // Header row

        debtorsCache.forEach(debtor => {
            const row = [
                `"${(debtor.name || '').replace(/"/g, '""')}"`,
                `"${(debtor.contact || '').replace(/"/g, '""')}"`,
                (debtor.amount || 0),
                `"${(debtor.currency || 'THB').replace(/"/g, '""')}"`,
                `"${(debtor.dateBorrowed || '').replace(/"/g, '""')}"`,
                `"${(debtor.dateDue || '').replace(/"/g, '""')}"`,
                `"${(debtor.status || '').replace(/"/g, '""')}"`,
                `"${(debtor.notes || '').replace(/"/g, '""')}"` // Escape double quotes within notes
            ].join(",");
            csvContent += row + "\r\n"; // Newline for each row
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) { // Feature detection
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "debtors_export.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showMessage('Export ข้อมูลเป็น CSV สำเร็จ!', 'success');
        } else {
            showMessage('การ Export CSV ไม่รองรับใน Browser นี้', 'error');
        }
    });
}

// --- Payment History Modal Logic ---

/**
 * Opens the payment history modal for a specific debtor and loads their payments.
 * @param {string} debtorId - The ID of the debtor.
 * @param {string} debtorName - The name of the debtor.
 */
async function openPaymentHistoryModal(debtorId, debtorName) {
    currentDebtorIdForPayment = debtorId; // Store for use in add payment form
    if (paymentModalTitle) paymentModalTitle.textContent = `ประวัติการชำระเงิน - ${debtorName}`;
    if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4">กำลังโหลดประวัติการชำระเงิน...</p>';
    if (addPaymentForm) {
        addPaymentForm.dataset.debtorId = debtorId; // Set debtorId on the form for adding new payments
        addPaymentForm.reset(); // Clear previous payment input
        // Set default payment date to today
        const today = new Date().toISOString().split('T')[0];
        if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = today;
    }
    if (paymentHistoryModal) paymentHistoryModal.classList.add('active');

    const paymentsPath = getPaymentsCollectionPath(debtorId);
    if (!paymentsPath) {
         if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">ไม่สามารถโหลดประวัติการชำระเงินได้ (Error: Path)</p>';
        return;
    }

    if (paymentListener) paymentListener(); // Unsubscribe from previous listener

    paymentListener = onSnapshot(query(collection(db, paymentsPath)), (snapshot) => {
        if (!paymentHistoryContent) return;
        let paymentsHtml = '';
        let totalPaidForDebtor = 0;
        const paymentsData = [];
        snapshot.forEach(doc => {
            paymentsData.push({id: doc.id, ...doc.data()});
        });

        // Client-side sort by datePaid (descending - newest first)
        paymentsData.sort((a,b) => new Date(b.datePaid) - new Date(a.datePaid));

        if (paymentsData.length === 0) {
            paymentsHtml = '<p class="text-center py-4 text-gray-500">ยังไม่มีประวัติการชำระเงินสำหรับลูกหนี้รายนี้</p>';
        } else {
            paymentsHtml = '<ul class="space-y-3 max-h-60 overflow-y-auto pr-2">';
            paymentsData.forEach(payment => {
                totalPaidForDebtor += (parseFloat(payment.amountPaid) || 0);
                const paymentDate = payment.datePaid ? new Date(payment.datePaid).toLocaleDateString('th-TH') : 'N/A';
                paymentsHtml += `
                    <li class="p-3 bg-gray-50 rounded-md shadow-sm">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="text-sm font-semibold text-green-600">จ่ายเมื่อ: ${paymentDate}</p>
                                <p class="text-lg font-bold">${(payment.amountPaid || 0).toLocaleString('th-TH')} บาท</p>
                                ${payment.paymentNote ? `<p class="text-xs text-gray-500 mt-1">หมายเหตุ: ${payment.paymentNote}</p>` : ''}
                            </div>
                            <button class="btn-icon text-red-500 hover:text-red-700 delete-payment" data-payment-id="${payment.id}" title="ลบรายการชำระเงินนี้"><i class="fas fa-times-circle"></i></button>
                        </div>
                    </li>`;
            });
            paymentsHtml += '</ul>';
            paymentsHtml += `<p class="mt-4 font-semibold text-right">รวมจ่ายแล้วสำหรับลูกหนี้รายนี้: ${totalPaidForDebtor.toLocaleString('th-TH')} บาท</p>`;
        }
        paymentHistoryContent.innerHTML = paymentsHtml;
        attachPaymentDeleteListeners(); // Re-attach listeners to new payment delete buttons
    }, (error) => {
        console.error("Error loading payments:", error);
        if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">เกิดข้อผิดพลาดในการโหลดประวัติการชำระเงิน</p>';
    });
}

/**
 * Attaches event listeners to delete buttons for payment items.
 */
function attachPaymentDeleteListeners() {
    document.querySelectorAll('.delete-payment').forEach(button => {
        // Replace button with a clone to remove old listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', handleDeletePayment);
    });
}

async function handleDeletePayment(e) {
    const paymentId = e.currentTarget.dataset.paymentId;
    if (!currentDebtorIdForPayment || !paymentId) {
        showMessage('ไม่สามารถลบรายการชำระเงิน: ID ไม่ถูกต้อง', 'error');
        return;
    }

    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการชำระเงินนี้?');
    if (confirmed) {
        const paymentsPath = getPaymentsCollectionPath(currentDebtorIdForPayment);
        if (!paymentsPath) return;
        const paymentDocPath = `${paymentsPath}/${paymentId}`;
        try {
            await deleteDoc(doc(db, paymentDocPath));
            showMessage('ลบรายการชำระเงินสำเร็จ', 'success');
            updateDashboard(); // Recalculate total paid overall
            // The onSnapshot for payments will auto-update the list in the modal
        } catch (error) {
            console.error("Error deleting payment:", error);
            showMessage(`เกิดข้อผิดพลาดในการลบรายการชำระเงิน: ${error.message}`, 'error');
        }
    }
}

/**
 * Closes the payment history modal.
 */
function closePaymentHistoryModalAction() {
    if (paymentHistoryModal) paymentHistoryModal.classList.remove('active');
    if (paymentListener) {
        paymentListener(); // Unsubscribe from payment listener when modal closes
        paymentListener = null;
    }
    currentDebtorIdForPayment = null; // Clear the current debtor ID
}
if (closePaymentHistoryModal) closePaymentHistoryModal.addEventListener('click', closePaymentHistoryModalAction);
if (closePaymentHistoryModalUpper) closePaymentHistoryModalUpper.addEventListener('click', closePaymentHistoryModalAction);

/**
 * Handles submission of the add payment form.
 */
if (addPaymentForm) {
    addPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const debtorId = addPaymentForm.dataset.debtorId;
        if (!debtorId) {
            showMessage('ไม่พบ ID ลูกหนี้สำหรับการเพิ่มรายการชำระเงิน', 'error');
            return;
        }
        if (!userId) {
            showMessage('คุณต้องเข้าสู่ระบบก่อน', 'error');
            return;
        }

        const paymentData = {
            amountPaid: parseFloat(addPaymentForm.paymentAmount.value),
            datePaid: addPaymentForm.paymentDate.value,
            paymentNote: addPaymentForm.paymentNote.value.trim(),
            createdAt: serverTimestamp()
        };

        if (!paymentData.amountPaid || !paymentData.datePaid || paymentData.amountPaid <=0) {
             showMessage('กรุณากรอกจำนวนเงินและวันที่ชำระให้ถูกต้อง', 'error');
            return;
        }

        const paymentsPath = getPaymentsCollectionPath(debtorId);
        if (!paymentsPath) return;

        try {
            await addDoc(collection(db, paymentsPath), paymentData);
            showMessage('เพิ่มรายการชำระเงินสำเร็จ!', 'success');
            addPaymentForm.reset();
             // Set default payment date to today again after reset
            const today = new Date().toISOString().split('T')[0];
            if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = today;

            updateDashboard(); // Recalculate total paid overall
            // The onSnapshot for payments will auto-update the list in the modal
        } catch (error) {
            console.error("Error adding payment:", error);
            showMessage(`เกิดข้อผิดพลาดในการเพิ่มรายการชำระเงิน: ${error.message}`, 'error');
        }
    });
}

// --- Initialization on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    createCustomConfirmModal(); // Create the custom confirm modal structure
    attemptInitialSignIn(); // Attempt Firebase sign-in after DOM is ready
    // Initial load of debtors is handled by onAuthStateChanged after sign-in.
});
