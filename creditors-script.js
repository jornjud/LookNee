// creditors-script.js (Version 1) - For Creditor Management

// These might be provided by an external environment (e.g., Canvas).
// Default values are used if not provided.
const EFFECTIVE_APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'looknee-2cb81'; // Your Firebase Project ID as default
const EFFECTIVE_INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// User-provided Firebase config (Should be the same as script.js)
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
    browserLocalPersistence
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
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global Application State Variables ---
let userId = null;
let creditorsListener = null; // Changed from debtorsListener
let creditorsCache = []; // Changed from debtorsCache
let paymentListener = null;
let currentCreditorIdForPayment = null; // Changed from currentDebtorIdForPayment

// --- DOM Element References ---
// Auth elements are the same
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutButton = document.getElementById('logoutButton');
const currentUserIdDisplay = document.getElementById('currentUserIdDisplay');
// Creditor specific elements
const addCreditorButton = document.getElementById('addCreditorButton');
const creditorModal = document.getElementById('creditorModal');
const creditorForm = document.getElementById('creditorForm');
const creditorModalTitle = document.getElementById('creditorModalTitle');
const cancelCreditorModal = document.getElementById('cancelCreditorModal');
const closeCreditorModalUpper = document.getElementById('closeCreditorModalUpper');
const creditorTableBody = document.getElementById('creditorTableBody');
const searchInput = document.getElementById('searchInput');
const sortBySelect = document.getElementById('sortBySelect');
// Dashboard stats
const totalCreditorsStat = document.getElementById('totalCreditorsStat');
const totalLiabilityStat = document.getElementById('totalLiabilityStat');
const totalPaidToCreditorsStat = document.getElementById('totalPaidToCreditorsStat');
const calendarView = document.getElementById('calendarView');
const exportCsvButton = document.getElementById('exportCsvButton');
// Payment modal elements
const paymentHistoryModal = document.getElementById('paymentHistoryModal');
const paymentHistoryContent = document.getElementById('paymentHistoryContent');
const closePaymentHistoryModal = document.getElementById('closePaymentHistoryModal');
const closePaymentHistoryModalUpper = document.getElementById('closePaymentHistoryModalUpper');
const addPaymentForm = document.getElementById('addPaymentForm');
const paymentModalTitle = document.getElementById('paymentModalTitle');
const paymentCreditorIdInput = document.getElementById('paymentCreditorId');
// Message and Confirm Modal
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

// ** CRITICAL CHANGE: Point to 'creditors' collection **
function getCreditorCollectionPath() {
    if (!userId) {
        console.error("User ID not available for Firestore path (creditors).");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/creditors`; // <-- Changed to 'creditors'
}

function getPaymentsCollectionPath(creditorId) {
     if (!userId || !creditorId) {
        console.error("User ID or Creditor ID not available for Firestore path (payments).");
        return null;
    }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/creditors/${creditorId}/payments`; // <-- Changed to 'creditors'
}

function createCustomConfirmModal() {
    if (document.getElementById('customConfirmModal')) return;
    confirmModalElement = document.createElement('div');
    confirmModalElement.id = 'customConfirmModal';
    confirmModalElement.className = 'modal fixed inset-0 bg-gray-800 bg-opacity-60 overflow-y-auto h-full w-full items-center justify-center p-4 z-[100]';
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
    if (!confirmModalElement) createCustomConfirmModal();
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

// --- Authentication Logic (Identical to script.js) ---
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Firebase auth persistence set to local for Creditors page.");
    initializeAuthListener();
  })
  .catch((error) => {
    console.error("Error setting Firebase auth persistence:", error);
    initializeAuthListener();
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
            loadCreditors(currentSearchTerm, currentSortBy); // Changed to loadCreditors
            updateDashboard();
        } else {
            userId = null;
            console.log("ผู้ใช้ออกจากระบบหรือไม่ก็ยังไม่ได้ล็อกอิน");
            if (userEmailDisplay) userEmailDisplay.textContent = '';
            if (currentUserIdDisplay) currentUserIdDisplay.textContent = '';
            if (authSection) authSection.style.display = 'flex';
            if (appSection) appSection.style.display = 'none';
            if (creditorsListener) { creditorsListener(); creditorsListener = null; }
            if (creditorTableBody) creditorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>';
            creditorsCache = [];
            if (totalCreditorsStat) totalCreditorsStat.textContent = '0';
            if (totalLiabilityStat) totalLiabilityStat.textContent = '0.00 บาท';
            if (totalPaidToCreditorsStat) totalPaidToCreditorsStat.textContent = '0.00 บาท';
            if (calendarView) calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>';
        }
    });
}

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

function showRegister() { if (loginForm) loginForm.style.display = 'none'; if (registerForm) registerForm.style.display = 'block'; }
function showLogin() { if (registerForm) registerForm.style.display = 'none'; if (loginForm) loginForm.style.display = 'block'; }
if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });

function mapAuthError(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return 'รูปแบบอีเมลไม่ถูกต้อง';
        case 'auth/user-disabled': return 'บัญชีผู้ใช้นี้ถูกระงับ';
        case 'auth/user-not-found': return 'ไม่พบบัญชีผู้ใช้นี้';
        case 'auth/wrong-password': return 'รหัสผ่านไม่ถูกต้อง';
        case 'auth/email-already-in-use': return 'อีเมลนี้มีผู้ใช้งานแล้ว';
        case 'auth/weak-password': return 'รหัสผ่านไม่รัดกุม (ควรมีอย่างน้อย 6 ตัวอักษร)';
        case 'auth/requires-recent-login': return 'การดำเนินการนี้มีความละเอียดอ่อนและต้องการการยืนยันตัวตนอีกครั้ง กรุณาล็อกเอาท์แล้วล็อกอินใหม่';
        default: return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    }
}

// --- Creditor Management Logic ---
if (addCreditorButton) {
    addCreditorButton.addEventListener('click', () => {
        if (creditorModal) creditorModal.classList.add('active');
        if (creditorModalTitle) creditorModalTitle.textContent = 'เพิ่มเจ้าหนี้ใหม่';
        if (creditorForm) {
            creditorForm.reset();
            const today = new Date().toISOString().split('T')[0];
            creditorForm.creditorDateBorrowed.value = today;
            creditorForm.dataset.mode = 'add';
            delete creditorForm.dataset.id;
        }
    });
}

function closeCreditorModalAction() {
    if (creditorModal) creditorModal.classList.remove('active');
}
if (cancelCreditorModal) cancelCreditorModal.addEventListener('click', closeCreditorModalAction);
if (closeCreditorModalUpper) closeCreditorModalUpper.addEventListener('click', closeCreditorModalAction);

if (creditorForm) {
    creditorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userId) { showMessage('คุณต้องเข้าสู่ระบบก่อน', 'error'); return; }
        const creditorData = {
            name: creditorForm.creditorName.value.trim(),
            contact: creditorForm.creditorContact.value.trim(),
            amount: parseFloat(creditorForm.creditorAmount.value),
            currency: creditorForm.creditorCurrency.value,
            dateBorrowed: creditorForm.creditorDateBorrowed.value,
            dateDue: creditorForm.creditorDateDue.value,
            status: creditorForm.creditorStatus.value,
            notes: creditorForm.creditorNotes.value.trim(),
            lastUpdated: serverTimestamp(),
            totalPaid: 0
        };
        if (!creditorData.name || isNaN(creditorData.amount) || creditorData.amount <= 0 || !creditorData.dateBorrowed || !creditorData.dateDue) {
            showMessage('กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วนและถูกต้อง', 'error'); return;
        }
        if (new Date(creditorData.dateDue) < new Date(creditorData.dateBorrowed)) {
            showMessage('วันที่กำหนดจ่ายคืนต้องไม่น้อยกว่าวันที่กู้', 'error'); return;
        }

        const creditorCollectionPath = getCreditorCollectionPath();
        if (!creditorCollectionPath) return;

        try {
            if (creditorForm.dataset.mode === 'add') {
                await addDoc(collection(db, creditorCollectionPath), creditorData);
                showMessage('เพิ่มเจ้าหนี้สำเร็จ!', 'success');
            } else {
                const creditorId = creditorForm.dataset.id;
                if (!creditorId) { showMessage('ไม่พบ ID เจ้าหนี้สำหรับการแก้ไข', 'error'); return; }
                await updateDoc(doc(db, creditorCollectionPath, creditorId), creditorData);
                showMessage('แก้ไขข้อมูลเจ้าหนี้สำเร็จ!', 'success');
            }
            closeCreditorModalAction();
        } catch (error) {
            console.error("Error saving creditor:", error);
            showMessage(`บันทึกข้อมูลเจ้าหนี้ไม่สำเร็จ: ${error.message}`, 'error');
        }
    });
}

async function loadCreditors(searchTerm = '', sortBy = 'name_asc') {
    if (!userId) { if (creditorTableBody) creditorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</td></tr>'; return; }
    const creditorCollectionPath = getCreditorCollectionPath();
    if (!creditorCollectionPath) return;
    if (creditorsListener) creditorsListener();
    const q = query(collection(db, creditorCollectionPath));
    if (creditorTableBody) creditorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูล...</td></tr>';

    creditorsListener = onSnapshot(q, (querySnapshot) => {
        creditorsCache = [];
        querySnapshot.forEach((doc) => {
            creditorsCache.push({ id: doc.id, ...doc.data() });
        });
        const currentSearchTerm = searchInput ? searchInput.value : '';
        const currentSortBy = sortBySelect ? sortBySelect.value : 'name_asc';
        renderCreditors(currentSearchTerm, currentSortBy);
        updateDashboard();
        renderCalendar();
    }, (error) => {
        console.error("Error loading creditors:", error);
        showMessage(`โหลดข้อมูลเจ้าหนี้ไม่สำเร็จ: ${error.message}`, 'error');
        if (creditorTableBody) creditorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>';
    });
}

function renderCreditors(searchTerm = '', sortBy = 'name_asc') {
    if (!creditorTableBody) return;
    creditorTableBody.innerHTML = '';
    let displayCreditors = [...creditorsCache];
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        displayCreditors = displayCreditors.filter(d =>
            d.name.toLowerCase().includes(lowerSearchTerm) ||
            (d.contact && d.contact.toLowerCase().includes(lowerSearchTerm))
        );
    }
    const [sortField, sortOrder] = sortBy.split('_');
    displayCreditors.sort((a, b) => {
        let valA = a[sortField]; let valB = b[sortField];
        if (sortField === 'amount' || sortField === 'totalPaid') { valA = parseFloat(valA || 0); valB = parseFloat(valB || 0); } 
        else if (sortField === 'dateBorrowed' || sortField === 'dateDue') { valA = new Date(valA); valB = new Date(valB); } 
        else if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    if (displayCreditors.length === 0) {
        creditorTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-gray-500">ไม่พบข้อมูลเจ้าหนี้${searchTerm ? 'ที่ตรงกับคำค้นหา' : ''}</td></tr>`;
        return;
    }
    displayCreditors.forEach(creditor => {
        const row = creditorTableBody.insertRow();
        row.className = 'bg-white hover:bg-gray-50 transition-colors duration-150';
        const today = new Date().toISOString().split('T')[0];
        let statusColor = 'text-gray-700';
        const principalAmount = parseFloat(creditor.amount) || 0;
        const totalPaid = parseFloat(creditor.totalPaid) || 0;

        let calculatedStatus = creditor.status;
        if (totalPaid >= principalAmount && principalAmount > 0) { calculatedStatus = 'จ่ายแล้ว'; } 
        else if (totalPaid > 0 && totalPaid < principalAmount) { calculatedStatus = 'จ่ายบางส่วน'; } 
        else { calculatedStatus = 'ยังไม่จ่าย'; }

        if (calculatedStatus === 'จ่ายแล้ว') statusColor = 'text-green-600 font-semibold';
        else if (calculatedStatus === 'จ่ายบางส่วน') statusColor = 'text-blue-600 font-semibold';
        else if (calculatedStatus === 'ยังไม่จ่าย' && creditor.dateDue && creditor.dateDue < today) statusColor = 'text-red-600 font-semibold';
        else if (calculatedStatus === 'ยังไม่จ่าย' && creditor.dateDue && creditor.dateDue === today) statusColor = 'text-yellow-600 font-semibold';

        const lastUpdated = creditor.lastUpdated?.toDate ? new Date(creditor.lastUpdated.toDate()).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A';
        row.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${creditor.name}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${creditor.contact || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(principalAmount).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${creditor.currency || 'THB'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${creditor.dateBorrowed || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${creditor.dateDue || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm ${statusColor}">${calculatedStatus}</td>
            <td class="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate" title="${creditor.notes || ''}">${creditor.notes || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${lastUpdated}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                <button class="btn-icon text-indigo-600 hover:text-indigo-900 edit-creditor" data-id="${creditor.id}" title="แก้ไข"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-red-600 hover:text-red-900 delete-creditor" data-id="${creditor.id}" title="ลบ"><i class="fas fa-trash"></i></button>
                <button class="btn-icon text-blue-600 hover:text-blue-900 view-payments" data-id="${creditor.id}" data-name="${creditor.name}" data-principal="${principalAmount}" title="ดู/เพิ่มประวัติการจ่ายคืน"><i class="fas fa-history"></i></button>
            </td>
        `;
    });
    attachActionListenersToCreditorRows();
}

function attachActionListenersToCreditorRows() {
    document.querySelectorAll('.edit-creditor').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].edit-creditor`).addEventListener('click', handleEditCreditor);});
    document.querySelectorAll('.delete-creditor').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].delete-creditor`).addEventListener('click', handleDeleteCreditor);});
    document.querySelectorAll('.view-payments').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); document.querySelector(`[data-id='${btn.dataset.id}'].view-payments`).addEventListener('click', handleViewPayments);});
}

async function handleEditCreditor(e) {
    const id = e.currentTarget.dataset.id;
    const path = getCreditorCollectionPath(); if (!path || !id) return;
    try {
        const creditorSnap = await getDoc(doc(db, path, id));
        if (creditorSnap.exists()) {
            const data = creditorSnap.data();
            creditorForm.creditorName.value = data.name || '';
            creditorForm.creditorContact.value = data.contact || '';
            creditorForm.creditorAmount.value = data.amount || 0;
            creditorForm.creditorCurrency.value = data.currency || 'THB';
            creditorForm.creditorDateBorrowed.value = data.dateBorrowed || '';
            creditorForm.creditorDateDue.value = data.dateDue || '';
            creditorForm.creditorStatus.value = data.status || 'ยังไม่จ่าย';
            creditorForm.creditorNotes.value = data.notes || '';
            creditorModalTitle.textContent = 'แก้ไขข้อมูลเจ้าหนี้';
            creditorForm.dataset.mode = 'edit';
            creditorForm.dataset.id = id;
            creditorModal.classList.add('active');
        } else { showMessage('ไม่พบข้อมูลเจ้าหนี้', 'error'); }
    } catch (err) { console.error("Error fetching creditor for edit:", err); showMessage(`เกิดข้อผิดพลาด: ${err.message}`, 'error'); }
}

async function handleDeleteCreditor(e) {
    const id = e.currentTarget.dataset.id;
    const path = getCreditorCollectionPath(); if (!path || !id) return;
    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบเจ้าหนี้รายนี้? การกระทำนี้จะลบประวัติการจ่ายเงินทั้งหมดด้วยและไม่สามารถย้อนกลับได้');
    if (confirmed) {
        try {
            const paymentsPath = getPaymentsCollectionPath(id);
            const paymentsSnapshot = await getDocs(collection(db, paymentsPath));
            const deletePromises = paymentsSnapshot.docs.map(pDoc => deleteDoc(doc(db, paymentsPath, pDoc.id)));
            await Promise.all(deletePromises);
            await deleteDoc(doc(db, path, id));
            showMessage('ลบเจ้าหนี้และประวัติการจ่ายเงินสำเร็จ', 'success');
        } catch (err) { console.error("Error deleting creditor:", err); showMessage(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function handleViewPayments(e) {
    const creditorId = e.currentTarget.dataset.id;
    const creditorName = e.currentTarget.dataset.name;
    const principalAmount = parseFloat(e.currentTarget.dataset.principal);
    openPaymentHistoryModal(creditorId, creditorName, principalAmount);
}

if (searchInput) searchInput.addEventListener('input', (e) => renderCreditors(e.target.value, sortBySelect ? sortBySelect.value : 'name_asc'));
if (sortBySelect) sortBySelect.addEventListener('change', (e) => renderCreditors(searchInput ? searchInput.value : '', e.target.value));

async function updateDashboard() {
    if (!userId || !creditorsCache) return;
    if (totalCreditorsStat) totalCreditorsStat.textContent = creditorsCache.length;
    let totalLiability = 0;
    let totalPaidOverall = 0;

    creditorsCache.forEach(d => {
        const principal = parseFloat(d.amount) || 0;
        const paid = parseFloat(d.totalPaid) || 0;
        totalPaidOverall += paid;
        if (d.status !== 'จ่ายแล้ว') {
            totalLiability += (principal - paid);
        }
    });

    if (totalLiabilityStat) totalLiabilityStat.textContent = Math.max(0, totalLiability).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
    if (totalPaidToCreditorsStat) totalPaidToCreditorsStat.textContent = totalPaidOverall.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
}


function renderCalendar() {
    if (!calendarView) return;
    if (!userId) { calendarView.innerHTML = '<p class="text-gray-500 text-center py-4">กรุณาเข้าสู่ระบบ</p>'; return; }
    const upcoming = creditorsCache
        .filter(d => {
            const principal = parseFloat(d.amount) || 0;
            const totalPaid = parseFloat(d.totalPaid) || 0;
            return totalPaid < principal && d.dateDue && new Date(d.dateDue) >= new Date(new Date().toDateString());
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
    } else if (creditorsCache.length > 0) {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">ไม่มีรายการครบกำหนดจ่ายเร็วๆ นี้</p>';
    } else {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">ยังไม่มีข้อมูลเจ้าหนี้</p>';
    }
}

if (exportCsvButton) {
    exportCsvButton.addEventListener('click', () => {
        if (creditorsCache.length === 0) { showMessage('ไม่มีข้อมูลสำหรับ Export', 'error'); return; }
        let csv = "\uFEFFชื่อเจ้าหนี้,ข้อมูลติดต่อ,จำนวนเงินที่กู้,สกุลเงิน,วันที่กู้,วันที่กำหนดจ่าย,สถานะ,หมายเหตุ,ยอดจ่ายแล้ว\n";
        creditorsCache.forEach(d => {
            const calculatedStatus = (parseFloat(d.totalPaid) || 0) >= (parseFloat(d.amount) || 0) && (parseFloat(d.amount) || 0) > 0 ? 'จ่ายแล้ว' : ((parseFloat(d.totalPaid) || 0) > 0 ? 'จ่ายบางส่วน' : 'ยังไม่จ่าย');
            csv += `"${(d.name||'').replace(/"/g,'""')}","${(d.contact||'').replace(/"/g,'""')}",${d.amount||0},"${d.currency||'THB'}","${d.dateBorrowed||''}","${d.dateDue||''}","${calculatedStatus}","${(d.notes||'').replace(/"/g,'""')}",${d.totalPaid||0}\r\n`;
        });
        const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href",url);
        link.setAttribute("download", "creditors_export.csv");
        link.style.visibility='hidden'; document.body.appendChild(link);
        link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        showMessage('Export ข้อมูลเป็น CSV สำเร็จ!', 'success');
    });
}

// --- Payment History Modal Logic & Automatic Creditor Status Update ---
let currentPrincipalAmountForPaymentModal = 0;

async function openPaymentHistoryModal(creditorId, creditorName, principalAmount) {
    currentCreditorIdForPayment = creditorId;
    currentPrincipalAmountForPaymentModal = principalAmount;
    if (paymentModalTitle) paymentModalTitle.textContent = `ประวัติจ่ายคืน - ${creditorName} (ยอดตั้งต้น: ${principalAmount.toLocaleString('th-TH')} บาท)`;
    if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4">กำลังโหลด...</p>';
    if (addPaymentForm) {
        if(paymentCreditorIdInput) paymentCreditorIdInput.value = creditorId;
        addPaymentForm.reset();
        if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
    }
    if (paymentHistoryModal) paymentHistoryModal.classList.add('active');

    const paymentsPath = getPaymentsCollectionPath(creditorId);
    if (!paymentsPath) { if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>'; return; }
    if (paymentListener) paymentListener();

    paymentListener = onSnapshot(query(collection(db, paymentsPath)), async (snapshot) => {
        if (!paymentHistoryContent) return;
        let paymentsHtml = ''; let totalPaidForThisCreditor = 0; const paymentsData = [];
        snapshot.forEach(doc => paymentsData.push({id: doc.id, ...doc.data()}));
        paymentsData.sort((a,b) => new Date(b.datePaid) - new Date(a.datePaid));

        if (paymentsData.length === 0) {
            paymentsHtml = '<p class="text-center py-4 text-gray-500">ยังไม่มีรายการจ่ายคืน</p>';
        } else {
            paymentsHtml = '<ul class="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2 bg-gray-50">';
            paymentsData.forEach(p => {
                totalPaidForThisCreditor += (parseFloat(p.amountPaid) || 0);
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
        const remainingBalance = currentPrincipalAmountForPaymentModal - totalPaidForThisCreditor;
        paymentsHtml += `<p class="mt-3 font-semibold text-sm text-right">รวมจ่ายแล้ว: ${totalPaidForThisCreditor.toLocaleString('th-TH')} บาท</p>`;
        paymentsHtml += `<p class="font-semibold text-sm text-right ${remainingBalance <= 0 ? 'text-green-600' : 'text-red-600'}">ยอดค้างจ่าย: ${remainingBalance.toLocaleString('th-TH')} บาท</p>`;

        paymentHistoryContent.innerHTML = paymentsHtml;
        attachPaymentDeleteListeners();
        await updateCreditorStatusAndTotalPaid(creditorId, totalPaidForThisCreditor, currentPrincipalAmountForPaymentModal);
    }, (error) => {
        console.error("Error loading payments:", error);
        if (paymentHistoryContent) paymentHistoryContent.innerHTML = '<p class="text-center py-4 text-red-500">โหลดประวัติการจ่ายคืนไม่สำเร็จ</p>';
    });
}

async function updateCreditorStatusAndTotalPaid(creditorId, totalPaidForThisCreditor, principalAmount) {
    const creditorDocPath = getCreditorCollectionPath();
    if (!creditorDocPath || !creditorId) return;

    let newStatus = 'ยังไม่จ่าย';
    if (totalPaidForThisCreditor >= principalAmount && principalAmount > 0) { newStatus = 'จ่ายแล้ว'; } 
    else if (totalPaidForThisCreditor > 0 && totalPaidForThisCreditor < principalAmount) { newStatus = 'จ่ายบางส่วน'; }
    
    const creditorRef = doc(db, creditorDocPath, creditorId);
    try {
        await updateDoc(creditorRef, {
            status: newStatus,
            totalPaid: totalPaidForThisCreditor,
            lastUpdated: serverTimestamp()
        });
        console.log(`สถานะเจ้าหนี้ ${creditorId} อัปเดตเป็น ${newStatus}, ยอดจ่ายรวม ${totalPaidForThisCreditor}`);
        updateDashboard();
    } catch (error) {
        console.error(`เกิดข้อผิดพลาดในการอัปเดตสถานะเจ้าหนี้ ${creditorId}:`, error);
        showMessage(`อัปเดตสถานะเจ้าหนี้ ${creditorId} ไม่สำเร็จ`, 'error');
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
    if (!currentCreditorIdForPayment || !paymentId) { showMessage('ID การจ่ายเงินไม่ถูกต้อง', 'error'); return; }
    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการจ่ายเงินนี้?');
    if (confirmed) {
        const paymentsPath = getPaymentsCollectionPath(currentCreditorIdForPayment);
        if (!paymentsPath) return;
        try {
            await deleteDoc(doc(db, paymentsPath, paymentId));
            showMessage('ลบรายการจ่ายเงินสำเร็จ', 'success');
        } catch (err) { console.error("Error deleting payment:", err); showMessage(`ลบรายการจ่ายเงินไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function closePaymentHistoryModalAction() {
    if (paymentHistoryModal) paymentHistoryModal.classList.remove('active');
    if (paymentListener) { paymentListener(); paymentListener = null; }
    currentCreditorIdForPayment = null;
}
if (closePaymentHistoryModal) closePaymentHistoryModal.addEventListener('click', closePaymentHistoryModalAction);
if (closePaymentHistoryModalUpper) closePaymentHistoryModalUpper.addEventListener('click', closePaymentHistoryModalAction);

if (addPaymentForm) {
    addPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const creditorId = paymentCreditorIdInput ? paymentCreditorIdInput.value : null;
        if (!creditorId) { showMessage('ไม่พบ ID เจ้าหนี้', 'error'); return; }
        if (!userId) { showMessage('คุณต้องเข้าสู่ระบบก่อน', 'error'); return; }
        const paymentData = {
            amountPaid: parseFloat(addPaymentForm.paymentAmount.value),
            datePaid: addPaymentForm.paymentDate.value,
            paymentNote: addPaymentForm.paymentNote.value.trim(),
            createdAt: serverTimestamp()
        };
        if (isNaN(paymentData.amountPaid) || paymentData.amountPaid <= 0 || !paymentData.datePaid) {
            showMessage('กรุณากรอกจำนวนเงินและวันที่จ่ายให้ถูกต้อง', 'error'); return;
        }
        const paymentsPath = getPaymentsCollectionPath(creditorId);
        if (!paymentsPath) return;
        try {
            await addDoc(collection(db, paymentsPath), paymentData);
            showMessage('เพิ่มรายการจ่ายเงินสำเร็จ!', 'success');
            addPaymentForm.reset();
            if(addPaymentForm.paymentDate) addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
        } catch (err) { console.error("Error adding payment:", err); showMessage(`เพิ่มรายการจ่ายเงินไม่สำเร็จ: ${err.message}`, 'error'); }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM พร้อมแล้ว เริ่มการทำงานของสคริปต์สำหรับหน้าเจ้าหนี้!");
    createCustomConfirmModal();
    const currentYearSpan = document.getElementById('currentYear');
    if(currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();
});
