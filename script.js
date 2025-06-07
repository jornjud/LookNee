// script.js (Version 2)

// These might be provided by an external environment (e.g., Canvas).
// Default values are used if not provided.
const EFFECTIVE_APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'looknee-2cb81'; // Your Firebase Project ID as default
const EFFECTIVE_INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// User-provided Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyA3bTaumvBXrdKAPAEeJJ7mfJAV_35PJZc",
    authDomain: "looknee-2cb81.firebaseapp.com",
    projectId: "looknee-2cb81",
    storageBucket: "looknee-2cb81.appspot.com",
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
    setPersistence,
    browserLocalPersistence // For remembering the user
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
    onSnapshot,
    serverTimestamp,
    updateDoc // Now definitely used for updating debtor status
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global Application State Variables ---
let userId = null;
let debtorsListener = null;
let debtorsCache = [];
let paymentListener = null;
let currentDebtorIdForPayment = null;

// --- DOM Element References ---
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
const paymentDebtorIdInput = document.getElementById('paymentDebtorId'); // For addPaymentForm

const messageContainer = document.getElementById('messageContainer');
let confirmModalElement, customConfirmMessageEl, customConfirmOkButton, customConfirmCancelButton;


// --- Utility Functions ---
function showMessage(message, type = 'success') {
    if (!messageContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `p-4 mb-4 text-sm rounded-lg shadow-md ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    messageDiv.setAttribute('role', 'alert');
    messageDiv.textContent = message;
    messageContainer.appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 5000);
}

function getDebtorCollectionPath() {
    if (!userId) {
        console.error("User ID not available for Firestore path (debtors).");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors`;
}

function getPaymentsCollectionPath(debtorId) {
     if (!userId || !debtorId) {
        console.error("User ID or Debtor ID not available for Firestore path (payments).");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors/${debtorId}/payments`;
}

function createCustomConfirmModal() {
    if (document.getElementById('customConfirmModal')) return;
    confirmModalElement = document.createElement('div');
    confirmModalElement.id = 'customConfirmModal';
    confirmModalElement.className = 'modal fixed inset-0 bg-gray-800 bg-opacity-60 overflow-y-auto h-full w-full items-center justify-center p-4 z-[100]'; // Higher z-index
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

function showCustomConfirm(message) {
    if (!confirmModalElement) createCustomConfirmModal(); // Ensure it's created
    return new Promise((resolve) => {
        customConfirmMessageEl.textContent = message;
        confirmModalElement.classList.add('active');
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
// Set session persistence to 'local' to remember the user across browser sessions
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase auth persistence set to local.");
    // Initialize Firebase Auth listener after persistence is set.
    initializeAuthListener();
  })
  .catch((error) => {
    console.error("Error setting Firebase auth persistence:", error);
    // Fallback or error handling
    initializeAuthListener(); // Still initialize listener even if persistence fails
  });


function initializeAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            console.log("ผู้ใช้ล็อกอินแล้ว:", userId, "Email:", user.email);
            if (userEmailDisplay) userEmailDisplay.textContent = user.email || "N/A";
            if (currentUserIdDisplay) currentUserIdDisplay.textContent = `ID: ${userId}`;
            if (authSection) authSection.style.display = 'none';
            if (appSection) appSection.style.display = 'block';
            const currentSearchTerm = searchInput ? searchInput.value : '';
            const currentSortBy = sortBySelect ? sortBySelect.value : 'name_asc';
            loadDebtors(currentSearchTerm, currentSortBy);
            updateDashboard();
        } else {
            userId = null;
            console.log("ผู้ใช้ออกจากระบบหรือไม่ก็ยังไม่ได้ล็อกอิน");
            if (userEmailDisplay) userEmailDisplay.textContent = '';
            if (currentUserIdDisplay) currentUserIdDisplay.textContent = '';
            if (authSection) authSection.style.display = 'flex';
            if (appSection) appSection.style.display = 'none';
            if (debtorsListener) { debtorsListener(); debtorsListener = null; }
            if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>';
            debtorsCache = [];
            if (totalDebtorsStat) totalDebtorsStat.textContent = '0';
            if (totalDebtAmountStat) totalDebtAmountStat.textContent = '0.00 บาท';
            if (totalPaidAmountStat) totalPaidAmountStat.textContent = '0.00 บาท';
            if (calendarView) calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>';
        }
    });
}


// No more attemptInitialSignIn, relying on onAuthStateChanged and user actions.

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
            console.error("เกิดข้อผิดพลาดในการล็อกอิน:", error);
            showMessage(`ล็อกอินไม่สำเร็จ: ${mapAuthError(error.code)}`, 'error');
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = registerForm.email.value;
        const password = registerForm.password.value;
        if (password.length < 6) {
            showMessage('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
            return;
        }
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            showMessage('ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านใหม่ของคุณ', 'success');
            registerForm.reset();
            showLogin();
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการลงทะเบียน:", error);
            showMessage(`ลงทะเบียนไม่สำเร็จ: ${mapAuthError(error.code)}`, 'error');
        }
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showMessage('ออกจากระบบแล้ว', 'success');
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการออกจากระบบ:", error);
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

function mapAuthError(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email':
            return 'รูปแบบอีเมลไม่ถูกต้อง';
        case 'auth/user-disabled':
            return 'บัญชีผู้ใช้นี้ถูกระงับ';
        case 'auth/user-not-found':
            return 'ไม่พบบัญชีผู้ใช้นี้';
        case 'auth/wrong-password':
            return 'รหัสผ่านไม่ถูกต้อง';
        case 'auth/email-already-in-use':
            return 'อีเมลนี้มีผู้ใช้งานแล้ว';
        case 'auth/weak-password':
            return 'รหัสผ่านไม่รัดกุม (ควรมีอย่างน้อย 6 ตัวอักษร)';
        case 'auth/requires-recent-login':
            return 'การดำเนินการนี้มีความละเอียดอ่อนและต้องการการยืนยันตัวตนอีกครั้ง กรุณาล็อกเอาท์แล้วล็อกอินใหม่';
        default:
            return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    }
}

// --- Debtor Management Logic ---
if (addDebtorButton) {
    addDebtorButton.addEventListener('click', () => {
        if (debtorModal) debtorModal.classList.add('active');
        if (debtorModalTitle) debtorModalTitle.textContent = 'เพิ่มลูกหนี้ใหม่';
        if (debtorForm) {
            debtorForm.reset();
            const today = new Date().toISOString().split('T')[0];
            debtorForm.debtorDateBorrowed.value = today; // Default borrowed date to today
            debtorForm.dataset.mode = 'add';
            delete debtorForm.dataset.id;
        }
    });
}

function closeDebtorModalAction() {
    if (debtorModal) debtorModal.classList.remove('active');
}
if (cancelDebtorModal) cancelDebtorModal.addEventListener('click', closeDebtorModalAction);
if (closeDebtorModalUpper) closeDebtorModalUpper.addEventListener('click', closeDebtorModalAction);

if (debtorForm) {
    debtorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userId) {
            showMessage('คุณต้องเข้าสู่ระบบก่อน', 'error'); return;
        }
        const debtorData = {
            name: debtorForm.debtorName.value.trim(),
            contact: debtorForm.debtorContact.value.trim(),
            amount: parseFloat(debtorForm.debtorAmount.value),
            currency: debtorForm.debtorCurrency.value,
            dateBorrowed: debtorForm.debtorDateBorrowed.value,
            dateDue: debtorForm.debtorDateDue.value,
            status: debtorForm.debtorStatus.value, // Initial status
            notes: debtorForm.debtorNotes.value.trim(),
            lastUpdated: serverTimestamp(),
            totalPaid: 0 // Initialize totalPaid for new debtors
        };
        if (!debtorData.name || isNaN(debtorData.amount) || debtorData.amount <= 0 || !debtorData.dateBorrowed || !debtorData.dateDue) {
            showMessage('กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วนและถูกต้อง', 'error'); return;
        }
        if (new Date(debtorData.dateDue) < new Date(debtorData.dateBorrowed)) {
            showMessage('วันที่ครบกำหนดต้องไม่น้อยกว่าวันที่ยืม', 'error'); return;
        }

        const debtorCollectionPath = getDebtorCollectionPath();
        if (!debtorCollectionPath) return;

        try {
            if (debtorForm.dataset.mode === 'add') {
                await addDoc(collection(db, debtorCollectionPath), debtorData);
                showMessage('เพิ่มลูกหนี้สำเร็จ!', 'success');
            } else {
                const debtorId = debtorForm.dataset.id;
                if (!debtorId) { showMessage('ไม่พบ ID ลูกหนี้สำหรับการแก้ไข', 'error'); return; }
                // When editing, we don't reset totalPaid here. It's managed by payments.
                // We might need to fetch the existing totalPaid if it's not part of the form.
                // For now, let's assume `status` is manually set or will be auto-updated by payments.
                await updateDoc(doc(db, debtorCollectionPath, debtorId), debtorData); // Using updateDoc for partial updates
                showMessage('แก้ไขข้อมูลลูกหนี้สำเร็จ!', 'success');
            }
            closeDebtorModalAction();
        } catch (error) {
            console.error("Error saving debtor:", error);
            showMessage(`บันทึกข้อมูลลูกหนี้ไม่สำเร็จ: ${error.message}`, 'error');
        }
    });
}

async function loadDebtors(searchTerm = '', sortBy = 'name_asc') {
    if (!userId) {
        if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>';
        return;
    }
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;
    if (debtorsListener) debtorsListener();
    const q = query(collection(db, debtorCollectionPath));
    if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูล...</td></tr>';

    debtorsListener = onSnapshot(q, (querySnapshot) => {
        debtorsCache = [];
        querySnapshot.forEach((doc) => {
            debtorsCache.push({ id: doc.id, ...doc.data() });
        });
        const currentSearchTerm = searchInput ? searchInput.value : '';
        const currentSortBy = sortBySelect ? sortBySelect.value : 'name_asc';
        renderDebtors(currentSearchTerm, currentSortBy);
        updateDashboard();
        renderCalendar();
    }, (error) => {
        console.error("Error loading debtors:", error);
        showMessage(`โหลดข้อมูลลูกหนี้ไม่สำเร็จ: ${error.message}`, 'error');
        if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>';
    });
}

function renderDebtors(searchTerm = '', sortBy = 'name_asc') {
    if (!debtorTableBody) return;
    debtorTableBody.innerHTML = '';
    let displayDebtors = [...debtorsCache];
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        displayDebtors = displayDebtors.filter(d =>
            d.name.toLowerCase().includes(lowerSearchTerm) ||
            (d.contact && d.contact.toLowerCase().includes(lowerSearchTerm))
        );
    }
    const [sortField, sortOrder] = sortBy.split('_');
    displayDebtors.sort((a, b) => {
        let valA = a[sortField]; let valB = b[sortField];
        if (sortField === 'amount' || sortField === 'totalPaid') {
            valA = parseFloat(valA || 0); valB = parseFloat(valB || 0);
        } else if (sortField === 'dateBorrowed' || sortField === 'dateDue') {
            valA = new Date(valA); valB = new Date(valB);
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase(); valB = valB.toLowerCase();
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    if (displayDebtors.length === 0) {
        debtorTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-gray-500">ไม่พบข้อมูลลูกหนี้${searchTerm ? 'ที่ตรงกับคำค้นหา' : ''}</td></tr>`;
        return;
    }
    displayDebtors.forEach(debtor => {
        const row = debtorTableBody.insertRow();
        row.className = 'bg-white hover:bg-gray-50 transition-colors duration-150';
        const today = new Date().toISOString().split('T')[0];
        let statusColor = 'text-gray-700';
        const principalAmount = parseFloat(debtor.amount) || 0;
        const totalPaid = parseFloat(debtor.totalPaid) || 0;

        // Determine status based on payments
        let calculatedStatus = debtor.status; // Use existing status as default or if manually set to "หนี้สูญ"
        if (debtor.status !== 'หนี้สูญ') { // Only auto-calculate if not "หนี้สูญ"
            if (totalPaid >= principalAmount && principalAmount > 0) {
                calculatedStatus = 'จ่ายแล้ว';
            } else if (totalPaid > 0 && totalPaid < principalAmount) {
                calculatedStatus = 'จ่ายบางส่วน';
            } else {
                calculatedStatus = 'ยังไม่จ่าย';
            }
        }


        if (calculatedStatus === 'จ่ายแล้ว') statusColor = 'text-green-600 font-semibold';
        else if (calculatedStatus === 'จ่ายบางส่วน') statusColor = 'text-blue-600 font-semibold';
        else if (calculatedStatus === 'ยังไม่จ่าย' && debtor.dateDue && debtor.dateDue < today) statusColor = 'text-red-600 font-semibold';
        else if (calculatedStatus === 'ยังไม่จ่าย' && debtor.dateDue && debtor.dateDue === today) statusColor = 'text-yellow-600 font-semibold';
        else if (debtor.status === 'หนี้สูญ') statusColor = 'text-purple-600 font-semibold';


        const lastUpdated = debtor.lastUpdated?.toDate ? new Date(debtor.lastUpdated.toDate()).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A';
        row.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${debtor.name}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.contact || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(principalAmount).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${debtor.currency || 'THB'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.dateBorrowed || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.dateDue || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm ${statusColor}">${calculatedStatus}</td>
            <td class="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate" title="${debtor.notes || ''}">${debtor.notes || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${lastUpdated}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                <button class="btn-icon text-indigo-600 hover:text-indigo-900 edit-debtor" data-id="${debtor.id}" title="แก้ไข"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-red-600 hover:text-red-900 delete-debtor" data-id="${debtor.id}" title="ลบ"><i class="fas fa-trash"></i></button>
                <button class="btn-icon text-blue-600 hover:text-blue-900 view-payments" data-id="${debtor.id}" data-name="${debtor.name}" data-principal="${principalAmount}" title="ดู/เพิ่มประวัติการชำระ"><i class="fas fa-history"></i></button>
            </td>
        `;
    });
    attachActionListenersToDebtorRows();
}

function attachActionListenersToDebtorRows() {
    document.querySelectorAll('.edit-debtor').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].edit-debtor`).addEventListener('click', handleEditDebtor);});
    document.querySelectorAll('.delete-debtor').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].delete-debtor`).addEventListener('click', handleDeleteDebtor);});
    document.querySelectorAll('.view-payments').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].view-payments`).addEventListener('click', handleViewPayments);});
}

async function handleEditDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const path = getDebtorCollectionPath(); if (!path || !id) return;
    try {
        const debtorSnap = await getDoc(doc(db, path, id));
        if (debtorSnap.exists()) {
            const data = debtorSnap.data();
            debtorForm.debtorName.value = data.name || '';
            debtorForm.debtorContact.value = data.contact || '';
            debtorForm.debtorAmount.value = data.amount || 0;
            debtorForm.debtorCurrency.value = data.currency || 'THB';
            debtorForm.debtorDateBorrowed.value = data.dateBorrowed || '';
            debtorForm.debtorDateDue.value = data.dateDue || '';
            debtorForm.debtorStatus.value = data.status || 'ยังไม่จ่าย'; // Keep original status for edit form
            debtorForm.debtorNotes.value = data.notes || '';
            debtorModalTitle.textContent = 'แก้ไขข้อมูลลูกหนี้';
            debtorForm.dataset.mode = 'edit';
            debtorForm.dataset.id = id;
            debtorModal.classList.add('active');
        } else { showMessage('ไม่พบข้อมูลลูกหนี้', 'error'); }
    } catch (err) { console.error("Error fetching debtor for edit:", err); showMessage(`เกิดข้อผิดพลาด: ${err.message}`, 'error'); }
}

async function handleDeleteDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const path = getDebtorCollectionPath(); if (!path || !id) return;
    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบลูกหนี้รายนี้? การกระทำนี้จะลบประวัติการชำระเงินทั้งหมดด้วยและไม่สามารถย้อนกลับได้');
    if (confirmed) {
        try {
            const paymentsPath = getPaymentsCollectionPath(id);
            const paymentsSnapshot = await getDocs(collection(db, paymentsPath));
            const deletePromises = paymentsSnapshot.docs.map(pDoc => deleteDoc(doc(db, paymentsPath, pDoc.id)));
            await Promise.all(deletePromises);
            await deleteDoc(doc(db, path, id));
            showMessage('ลบลูกหนี้และประวัติการชำระเงินสำเร็จ', 'success');
        } catch (err) { console.error("Error deleting debtor:", err); showMessage(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function handleViewPayments(e) {
    const debtorId = e.currentTarget.dataset.id;
    const debtorName = e.currentTarget.dataset.name;
    const principalAmount = parseFloat(e.currentTarget.dataset.principal);
    openPaymentHistoryModal(debtorId, debtorName, principalAmount);
}

if (searchInput) searchInput.addEventListener('input', (e) => renderDebtors(e.target.value, sortBySelect ? sortBySelect.value : 'name_asc'));
if (sortBySelect) sortBySelect.addEventListener('change', (e) => renderDebtors(searchInput ? searchInput.value : '', e.target.value));

async function updateDashboard() {
    if (!userId || !debtorsCache) return;
    if (totalDebtorsStat) totalDebtorsStat.textContent = debtorsCache.length;
    const totalDebtPrincipal = debtorsCache.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    let totalPaidOverall = 0;
    let outstandingDebt = 0;

    debtorsCache.forEach(d => {
        const principal = parseFloat(d.amount) || 0;
        const paid = parseFloat(d.totalPaid) || 0;
        totalPaidOverall += paid;
        if (d.status !== 'จ่ายแล้ว' && d.status !== 'หนี้สูญ') {
            outstandingDebt += (principal - paid);
        }
    });

    if (totalDebtAmountStat) totalDebtAmountStat.textContent = Math.max(0, outstandingDebt).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
    if (totalPaidAmountStat) totalPaidAmountStat.textContent = totalPaidOverall.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
}


function renderCalendar() {
    if (!calendarView) return;
    if (!userId) { calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>'; return; }
    const upcoming = debtorsCache
        .filter(d => {
            const principal = parseFloat(d.amount) || 0;
            const totalPaid = parseFloat(d.totalPaid) || 0;
            // Only show if not fully paid and not "หนี้สูญ"
            return totalPaid < principal && d.status !== 'หนี้สูญ' && d.dateDue && new Date(d.dateDue) >= new Date(new Date().toDateString()); // Compare date part only
        })
        .sort((a,b) => new Date(a.dateDue) - new Date(b.dateDue))
        .slice(0,5);
    if (upcoming.length > 0) {
        let html = '<ul class="space-y-1 mt-1">';
        upcoming.forEach(d => {
            const dueDate = new Date(d.dateDue);
            const formattedDate = dueDate.toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
            html += `<li class="text-gray-700">🗓️ <span class="font-semibold">${d.name}</span> - ${formattedDate} (${(parseFloat(d.amount)||0).toLocaleString('th-TH')} ${d.currency||'THB'})</li>`;
        });
        html += '</ul>';
        calendarView.innerHTML = html;
    } else if (debtorsCache.length > 0) {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">ไม่มีรายการครบกำหนดเร็วๆ นี้</p>';
    } else {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">ยังไม่มีข้อมูลลูกหนี้</p>';
    }
}

if (exportCsvButton) {
    exportCsvButton.addEventListener('click', () => {
        if (debtorsCache.length === 0) { showMessage('ไม่มีข้อมูลสำหรับ Export', 'error'); return; }
        let csv = "\uFEFFชื่อ,ข้อมูลติดต่อ,จำนวนเงิน,สกุลเงิน,วันที่ยืม,วันที่ครบกำหนด,สถานะ,หมายเหตุ,ยอดชำระแล้ว\n";
        debtorsCache.forEach(d => {
            const calculatedStatus = (parseFloat(d.totalPaid) || 0) >= (parseFloat(d.amount) || 0) && (parseFloat(d.amount) || 0) > 0 ? 'จ่ายแล้ว' : ((parseFloat(d.totalPaid) || 0) > 0 ? 'จ่ายบางส่วน' : (d.status === 'หนี้สูญ' ? 'หนี้สูญ' : 'ยังไม่จ่าย'));
            csv += `"${(d.name||'').replace(/"/g,'""')}","${(d.contact||'').replace(/"/g,'""')}",${d.amount||0},"${d.currency||'THB'}","${d.dateBorrowed||''}","${d.dateDue||''}","${calculatedStatus}","${(d.notes||'').replace(/"/g,'""')}",${d.totalPaid||0}\r\n`;
        });
        const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href",url);
        link.setAttribute("download", "debtors_export.csv");
        link.style.visibility='hidden'; document.body.appendChild(link);
        link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        showMessage('Export ข้อมูลเป็น CSV สำเร็จ!', 'success');
    });
}

// --- Payment History Modal Logic & Automatic Debtor Status Update ---
let currentPrincipalAmountForPaymentModal = 0;

async function openPaymentHistoryModal(debtorId, debtorName, principalAmount) {
    currentDebtorIdForPayment = debtorId;
    currentPrincipalAmountForPaymentModal = principalAmount;
    if (paymentModalTitle) paymentModalTitle.textContent = `ประวัติชำระ - ${debtorName} (ยอดตั้งต้น: ${principalAmount.toLocaleString('th-TH')} บาท)`;
    if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4">กำลังโหลด...</p>';
    if (addPaymentForm) {
        if(paymentDebtorIdInput) paymentDebtorIdInput.value = debtorId; // Set hidden input
        addPaymentForm.reset();
        if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
    }
    if (paymentHistoryModal) paymentHistoryModal.classList.add('active');

    const paymentsPath = getPaymentsCollectionPath(debtorId);
    if (!paymentsPath) { if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>'; return; }
    if (paymentListener) paymentListener();

    paymentListener = onSnapshot(query(collection(db, paymentsPath)), async (snapshot) => {
        if (!paymentHistoryContent) return;
        let paymentsHtml = ''; let totalPaidForThisDebtor = 0; const paymentsData = [];
        snapshot.forEach(doc => paymentsData.push({id: doc.id, ...doc.data()}));
        paymentsData.sort((a,b) => new Date(b.datePaid) - new Date(a.datePaid));

        if (paymentsData.length === 0) {
            paymentsHtml = '<p class="text-center py-4 text-gray-500">ยังไม่มีรายการชำระ</p>';
        } else {
            paymentsHtml = '<ul class="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2 bg-gray-50">';
            paymentsData.forEach(p => {
                totalPaidForThisDebtor += (parseFloat(p.amountPaid) || 0);
                const pDate = p.datePaid ? new Date(p.datePaid).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A';
                paymentsHtml += `
                    <li class="p-2 bg-white rounded shadow-sm border border-gray-200">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="text-xs font-semibold text-green-600">จ่ายเมื่อ: ${pDate}</p>
                                <p class="text-md font-bold">${(p.amountPaid||0).toLocaleString('th-TH')} บาท</p>
                                ${p.paymentNote ? `<p class="text-xs text-gray-500 mt-1">หมายเหตุ: ${p.paymentNote}</p>` : ''}
                            </div>
                            <button class="btn-icon text-red-400 hover:text-red-600 delete-payment" data-payment-id="${p.id}" data-amount="${p.amountPaid}" title="ลบรายการนี้"><i class="fas fa-times-circle"></i></button>
                        </div>
                    </li>`;
            });
            paymentsHtml += '</ul>';
        }
        const remainingBalance = currentPrincipalAmountForPaymentModal - totalPaidForThisDebtor;
        paymentsHtml += `<p class="mt-3 font-semibold text-sm text-right">รวมจ่ายแล้ว: ${totalPaidForThisDebtor.toLocaleString('th-TH')} บาท</p>`;
        paymentsHtml += `<p class="font-semibold text-sm text-right ${remainingBalance <= 0 ? 'text-green-600' : 'text-red-600'}">ยอดคงเหลือ: ${remainingBalance.toLocaleString('th-TH')} บาท</p>`;

        paymentHistoryContent.innerHTML = paymentsHtml;
        attachPaymentDeleteListeners();
        // After payments are loaded/updated, update the debtor's main status and totalPaid
        await updateDebtorStatusAndTotalPaid(debtorId, totalPaidForThisDebtor, currentPrincipalAmountForPaymentModal);
    }, (error) => {
        console.error("Error loading payments:", error);
        if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">โหลดประวัติการชำระเงินไม่สำเร็จ</p>';
    });
}

async function updateDebtorStatusAndTotalPaid(debtorId, totalPaidForThisDebtor, principalAmount) {
    const debtorDocPath = getDebtorCollectionPath();
    if (!debtorDocPath || !debtorId) return;

    let newStatus = 'ยังไม่จ่าย';
    if (totalPaidForThisDebtor >= principalAmount && principalAmount > 0) {
        newStatus = 'จ่ายแล้ว';
    } else if (totalPaidForThisDebtor > 0 && totalPaidForThisDebtor < principalAmount) {
        newStatus = 'จ่ายบางส่วน';
    }
    // We don't automatically set to 'หนี้สูญ' here. That should be a manual decision.
    // Only update status if it's not already 'หนี้สูญ'.
    const debtorRef = doc(db, debtorDocPath, debtorId);
    try {
        const currentDebtorSnap = await getDoc(debtorRef);
        if (currentDebtorSnap.exists() && currentDebtorSnap.data().status === 'หนี้สูญ') {
            // If status is 'หนี้สูญ', only update totalPaid, not status
            await updateDoc(debtorRef, {
                totalPaid: totalPaidForThisDebtor,
                lastUpdated: serverTimestamp()
            });
        } else {
            await updateDoc(debtorRef, {
                status: newStatus,
                totalPaid: totalPaidForThisDebtor,
                lastUpdated: serverTimestamp()
            });
        }
        console.log(`สถานะลูกหนี้ ${debtorId} อัปเดตเป็น ${newStatus}, ยอดจ่ายรวม ${totalPaidForThisDebtor}`);
        updateDashboard(); // Refresh dashboard after status update
    } catch (error) {
        console.error(`เกิดข้อผิดพลาดในการอัปเดตสถานะลูกหนี้ ${debtorId}:`, error);
        showMessage(`อัปเดตสถานะลูกหนี้ ${debtorId} ไม่สำเร็จ`, 'error');
    }
}


function attachPaymentDeleteListeners() {
    document.querySelectorAll('.delete-payment').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
        const currentBtn = document.querySelector(`.delete-payment[data-payment-id='${btn.dataset.paymentId}']`);
        if (currentBtn) currentBtn.addEventListener('click', handleDeletePayment);
    });
}

async function handleDeletePayment(e) {
    const paymentId = e.currentTarget.dataset.paymentId;
    const amountDeleted = parseFloat(e.currentTarget.dataset.amount || 0); // Get amount for recalculation
    if (!currentDebtorIdForPayment || !paymentId) { showMessage('ID การชำระเงินไม่ถูกต้อง', 'error'); return; }
    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการชำระเงินนี้?');
    if (confirmed) {
        const paymentsPath = getPaymentsCollectionPath(currentDebtorIdForPayment);
        if (!paymentsPath) return;
        try {
            await deleteDoc(doc(db, paymentsPath, paymentId));
            showMessage('ลบรายการชำระเงินสำเร็จ', 'success');
            // The onSnapshot in openPaymentHistoryModal will re-fetch payments and trigger status update.
            // No need to manually call updateDebtorStatusAndTotalPaid here if onSnapshot is active for payments.
        } catch (err) { console.error("Error deleting payment:", err); showMessage(`ลบรายการชำระเงินไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function closePaymentHistoryModalAction() {
    if (paymentHistoryModal) paymentHistoryModal.classList.remove('active');
    if (paymentListener) { paymentListener(); paymentListener = null; }
    currentDebtorIdForPayment = null;
}
if (closePaymentHistoryModal) closePaymentHistoryModal.addEventListener('click', closePaymentHistoryModalAction);
if (closePaymentHistoryModalUpper) closePaymentHistoryModalUpper.addEventListener('click', closePaymentHistoryModalAction);

if (addPaymentForm) {
    addPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const debtorId = paymentDebtorIdInput ? paymentDebtorIdInput.value : null; // Get from hidden input
        if (!debtorId) { showMessage('ไม่พบ ID ลูกหนี้', 'error'); return; }
        if (!userId) { showMessage('คุณต้องเข้าสู่ระบบก่อน', 'error'); return; }
        const paymentData = {
            amountPaid: parseFloat(addPaymentForm.paymentAmount.value),
            datePaid: addPaymentForm.paymentDate.value,
            paymentNote: addPaymentForm.paymentNote.value.trim(),
            createdAt: serverTimestamp()
        };
        if (isNaN(paymentData.amountPaid) || paymentData.amountPaid <= 0 || !paymentData.datePaid) {
            showMessage('กรุณากรอกจำนวนเงินและวันที่ชำระให้ถูกต้อง', 'error'); return;
        }
        const paymentsPath = getPaymentsCollectionPath(debtorId);
        if (!paymentsPath) return;
        try {
            await addDoc(collection(db, paymentsPath), paymentData);
            showMessage('เพิ่มรายการชำระเงินสำเร็จ!', 'success');
            addPaymentForm.reset();
            if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0]; // Reset date to today
            // onSnapshot will handle updating the list and debtor status
        } catch (err) { console.error("Error adding payment:", err); showMessage(`เพิ่มรายการชำระเงินไม่สำเร็จ: ${err.message}`, 'error'); }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM พร้อมแล้ว เริ่มการทำงานของสคริปต์!");
    createCustomConfirmModal();
    // Auth listener is initialized after persistence is set
    // No initial data loading here, onAuthStateChanged handles it.
    const currentYearSpan = document.getElementById('currentYear');
    if(currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();
});
