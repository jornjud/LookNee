// script.js (Theme: Minimalist, Features: Phase 1, Bug Fixes: Data Path & Export)

// --- Firebase and Environment Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyA3bTaumvBXrdKAPAEeJJ7mfJAV_35PJZc",
    authDomain: "looknee-2cb81.firebaseapp.com",
    projectId: "looknee-2cb81", // FIXED: Use correct project ID
    storageBucket: "looknee-2cb81.appspot.com",
    messagingSenderId: "41415066815",
    appId: "1:41415066815:web:78569d85b881cae371b20a"
};

// --- Firebase SDK Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, query, onSnapshot, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global Application State ---
let userId = null;
let debtorsListener = null;
let debtorsCache = [];
let paymentListener = null;
let currentDebtorIdForPayment = null;
let currentStatusFilter = 'all';

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

// Layout Elements
const sidebar = document.getElementById('sidebar');
const hamburgerButton = document.getElementById('hamburgerButton');

// App Section Elements
const addDebtorButton = document.getElementById('addDebtorButton');
const debtorModal = document.getElementById('debtorModal');
const debtorForm = document.getElementById('debtorForm');
const debtorModalTitle = document.getElementById('debtorModalTitle');
const cancelDebtorModal = document.getElementById('cancelDebtorModal');
const closeDebtorModalUpper = document.getElementById('closeDebtorModalUpper');
const debtorTableBody = document.getElementById('debtorTableBody');
const searchInput = document.getElementById('searchInput');
const exportCsvButton = document.getElementById('exportCsvButton'); // FIXED: Added reference to export button

// Dashboard Stat Elements
const totalDebtAmountStat = document.getElementById('totalDebtAmountStat');
const overdueStat = document.getElementById('overdueStat');
const overdueAmountStat = document.getElementById('overdueAmountStat');
const dueTodayStat = document.getElementById('dueTodayStat');
const dueTodayAmountStat = document.getElementById('dueTodayAmountStat');
const dueSoonStat = document.getElementById('dueSoonStat');
const dueSoonAmountStat = document.getElementById('dueSoonAmountStat');

// Status Filter Elements
const statusFilterButtons = document.querySelectorAll('.status-filter');

// Payment Modal Elements
const paymentHistoryModal = document.getElementById('paymentHistoryModal');
const paymentHistoryContent = document.getElementById('paymentHistoryContent');
const closePaymentHistoryModal = document.getElementById('closePaymentHistoryModal');
const closePaymentHistoryModalUpper = document.getElementById('closePaymentHistoryModalUpper');
const addPaymentForm = document.getElementById('addPaymentForm');
const paymentModalTitle = document.getElementById('paymentModalTitle');
const paymentDebtorIdInput = document.getElementById('paymentDebtorId');

// Global Modals and Messages
const messageContainer = document.getElementById('messageContainer');
let confirmModalElement, customConfirmMessageEl, customConfirmOkButton, customConfirmCancelButton;

// --- Utility Functions ---

function showMessage(message, type = 'success') {
    if (!messageContainer) return;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
    const color = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    const messageDiv = document.createElement('div');
    messageDiv.className = `p-4 mb-3 text-sm text-white rounded-lg shadow-xl flex items-center gap-3 animate-fadeIn`;
    messageDiv.innerHTML = `<i class="fas ${icon} text-xl"></i><span>${message}</span>`;
    messageContainer.appendChild(messageDiv);
    setTimeout(() => {
        messageDiv.classList.add('animate-fadeOut');
        messageDiv.addEventListener('animationend', () => messageDiv.remove());
    }, 5000);
}

// FIXED: Function now correctly uses the project ID from the config
function getDebtorCollectionPath() {
    const appId = firebaseConfig.projectId; // Use the actual projectId from the config
    if (!userId) {
        console.error("User ID not available for Firestore path.");
        return null;
    }
    return `artifacts/${appId}/users/${userId}/debtors`;
}

function getPaymentsCollectionPath(debtorId) {
    const debtorsPath = getDebtorCollectionPath();
    if (!debtorsPath || !debtorId) return null;
    return `${debtorsPath}/${debtorId}/payments`;
}


// --- Authentication Logic ---
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Firebase auth persistence set to local.");
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
            console.log("ผู้ใช้ล็อกอินแล้ว:", userId);
            if (userEmailDisplay) userEmailDisplay.textContent = user.email || "N/A";
            if (currentUserIdDisplay) currentUserIdDisplay.textContent = `User ID: ${userId.substring(0,10)}...`;
            authSection.style.display = 'none';
            appSection.style.display = 'flex';
            loadDebtors();
        } else {
            userId = null;
            console.log("ผู้ใช้ออกจากระบบ");
            authSection.style.display = 'flex';
            appSection.style.display = 'none';
            if (debtorsListener) {
                debtorsListener();
                debtorsListener = null;
            }
            debtorsCache = [];
            renderDebtors();
            updateSmarterDashboard();
        }
    });
}

if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (registerForm) registerForm.addEventListener('submit', handleRegister);
if (logoutButton) logoutButton.addEventListener('click', handleLogout);
if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
if (exportCsvButton) exportCsvButton.addEventListener('click', handleExportCsv); // FIXED: Added event listener

async function handleLogin(e) { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value); showMessage('เข้าสู่ระบบสำเร็จ!', 'success'); loginForm.reset(); } catch (error) { showMessage(`ล็อกอินไม่สำเร็จ: ${mapAuthError(error.code)}`, 'error'); } }
async function handleRegister(e) { e.preventDefault(); if (registerForm.password.value.length < 6) { showMessage('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; } try { await createUserWithEmailAndPassword(auth, registerForm.email.value, registerForm.password.value); showMessage('ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ', 'success'); registerForm.reset(); showLogin(); } catch (error) { showMessage(`ลงทะเบียนไม่สำเร็จ: ${mapAuthError(error.code)}`, 'error'); } }
async function handleLogout() { try { await signOut(auth); showMessage('ออกจากระบบแล้ว', 'success'); } catch (error) { showMessage(`ออกจากระบบไม่สำเร็จ: ${error.message}`, 'error'); } }
function showRegister() { loginForm.style.display = 'none'; registerForm.style.display = 'block'; }
function showLogin() { registerForm.style.display = 'none'; loginForm.style.display = 'block'; }
function mapAuthError(code) { const errors = { 'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง', 'auth/user-not-found': 'ไม่พบบัญชีผู้ใช้นี้', 'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง', 'auth/email-already-in-use': 'อีเมลนี้มีผู้ใช้งานแล้ว', 'auth/weak-password': 'รหัสผ่านสั้นเกินไป (ขั้นต่ำ 6 ตัวอักษร)', }; return errors[code] || 'เกิดข้อผิดพลาดที่ไม่รู้จัก'; }

// --- Layout & UI Interaction Logic ---
if (hamburgerButton) { hamburgerButton.addEventListener('click', () => { sidebar.classList.toggle('-translate-x-full'); }); }

// --- Debtor Management Logic ---
addDebtorButton.addEventListener('click', openAddDebtorModal);
cancelDebtorModal.addEventListener('click', closeDebtorModalAction);
closeDebtorModalUpper.addEventListener('click', closeDebtorModalAction);

function openAddDebtorModal() { debtorModal.classList.add('active'); debtorModalTitle.textContent = 'เพิ่มลูกหนี้ใหม่'; debtorForm.reset(); debtorForm.debtorDateBorrowed.value = new Date().toISOString().split('T')[0]; debtorForm.dataset.mode = 'add'; delete debtorForm.dataset.id; }
function closeDebtorModalAction() { debtorModal.classList.remove('active'); }

debtorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId) { showMessage('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error'); return; }
    const debtorData = { name: debtorForm.debtorName.value.trim(), contact: debtorForm.debtorContact.value.trim(), amount: parseFloat(debtorForm.debtorAmount.value), currency: debtorForm.debtorCurrency.value, dateBorrowed: debtorForm.debtorDateBorrowed.value, dateDue: debtorForm.debtorDateDue.value, status: debtorForm.dataset.mode === 'add' ? 'ยังไม่จ่าย' : debtorForm.debtorStatus.value, notes: debtorForm.debtorNotes.value.trim(), lastUpdated: serverTimestamp(), };
    if (!debtorData.name || isNaN(debtorData.amount) || !debtorData.dateBorrowed || !debtorData.dateDue) { showMessage('กรุณากรอกข้อมูลที่จำเป็น (*)', 'error'); return; }
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;
    try {
        if (debtorForm.dataset.mode === 'add') { debtorData.totalPaid = 0; await addDoc(collection(db, debtorCollectionPath), debtorData); showMessage('เพิ่มลูกหนี้สำเร็จ!', 'success'); }
        else { const debtorId = debtorForm.dataset.id; await updateDoc(doc(db, debtorCollectionPath, debtorId), debtorData); showMessage('แก้ไขข้อมูลลูกหนี้สำเร็จ!', 'success'); }
        closeDebtorModalAction();
    } catch (error) { console.error("Error saving debtor:", error); showMessage(`บันทึกข้อมูลล้มเหลว: ${error.message}`, 'error'); }
});

// --- Data Loading and Rendering ---
function loadDebtors() {
    if (!userId) return;
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;
    if (debtorsListener) debtorsListener();
    const q = query(collection(db, debtorCollectionPath));
    if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลดข้อมูล...</td></tr>';
    debtorsListener = onSnapshot(q, (querySnapshot) => {
        debtorsCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDebtors(searchInput.value, currentStatusFilter);
        updateSmarterDashboard();
    }, (error) => { console.error("Error loading debtors:", error); showMessage(`ไม่สามารถโหลดข้อมูลได้: ${error.message}`, 'error'); if (debtorTableBody) debtorTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>'; });
}

function getCalculatedStatus(debtor) {
    const principal = parseFloat(debtor.amount) || 0;
    const totalPaid = parseFloat(debtor.totalPaid) || 0;
    const today = new Date().toISOString().split('T')[0];
    if (debtor.status === 'หนี้สูญ') return 'หนี้สูญ';
    if (principal > 0 && totalPaid >= principal) return 'จ่ายแล้ว';
    if (totalPaid > 0 && totalPaid < principal) return 'จ่ายบางส่วน';
    if (debtor.dateDue && debtor.dateDue < today) return 'เลยกำหนด';
    return 'ยังไม่จ่าย';
}

function renderDebtors(searchTerm = '', statusFilter = 'all') {
    if (!debtorTableBody) return;
    debtorTableBody.innerHTML = '';
    const lowerSearchTerm = searchTerm.toLowerCase();
    let displayDebtors = debtorsCache.filter(d => {
        const calculatedStatus = getCalculatedStatus(d);
        const nameMatch = d.name.toLowerCase().includes(lowerSearchTerm);
        const contactMatch = d.contact && d.contact.toLowerCase().includes(lowerSearchTerm);
        const statusMatch = (statusFilter === 'all') || (calculatedStatus === statusFilter);
        return (nameMatch || contactMatch) && statusMatch;
    });
    displayDebtors.sort((a, b) => new Date(b.lastUpdated?.toDate() || 0) - new Date(a.lastUpdated?.toDate() || 0));
    if (displayDebtors.length === 0) { debtorTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-500">ไม่พบข้อมูลลูกหนี้</td></tr>`; return; }
    displayDebtors.forEach(debtor => {
        const row = debtorTableBody.insertRow();
        row.className = 'hover:bg-gray-50 transition-colors duration-150';
        const principalAmount = parseFloat(debtor.amount) || 0;
        const lastUpdated = debtor.lastUpdated?.toDate ? new Date(debtor.lastUpdated.toDate()).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
        const calculatedStatus = getCalculatedStatus(debtor);
        const statusInfo = getStatusTagInfo(calculatedStatus);
        row.innerHTML = `
            <td class="td-cell"><div class="font-medium text-gray-900">${debtor.name}</div><div class="text-xs text-gray-500">${debtor.contact || 'ไม่มีข้อมูลติดต่อ'}</div></td>
            <td class="td-cell text-right"><div class="font-semibold text-gray-800">${(principalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ${debtor.currency || 'THB'}</div></td>
            <td class="td-cell text-gray-600">${debtor.dateDue ? new Date(debtor.dateDue + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
            <td class="td-cell"><span class="status-tag ${statusInfo.cssClass}">${statusInfo.text}</span></td>
            <td class="td-cell text-gray-500">${lastUpdated}</td>
            <td class="td-cell text-center">
                <button class="btn-icon text-indigo-600 edit-debtor" data-id="${debtor.id}" title="แก้ไข"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-blue-600 view-payments" data-id="${debtor.id}" data-name="${debtor.name}" data-principal="${principalAmount}" title="ดู/เพิ่มประวัติการชำระ"><i class="fas fa-history"></i></button>
                <button class="btn-icon text-red-600 delete-debtor" data-id="${debtor.id}" title="ลบ"><i class="fas fa-trash"></i></button>
            </td>`;
    });
    attachActionListenersToDebtorRows();
}

function getStatusTagInfo(status) { const map = { 'จ่ายแล้ว': { text: 'จ่ายแล้ว', cssClass: 'status-green' }, 'จ่ายบางส่วน': { text: 'จ่ายบางส่วน', cssClass: 'status-blue' }, 'ยังไม่จ่าย': { text: 'ยังไม่จ่าย', cssClass: 'status-yellow' }, 'เลยกำหนด': { text: 'เลยกำหนด', cssClass: 'status-red' }, 'หนี้สูญ': { text: 'หนี้สูญ', cssClass: 'status-purple' } }; return map[status] || { text: 'ไม่ระบุ', cssClass: 'status-gray' }; }
function attachActionListenersToDebtorRows() { document.querySelectorAll('.edit-debtor').forEach(btn => btn.addEventListener('click', handleEditDebtor)); document.querySelectorAll('.delete-debtor').forEach(btn => btn.addEventListener('click', handleDeleteDebtor)); document.querySelectorAll('.view-payments').forEach(btn => btn.addEventListener('click', handleViewPayments)); }
async function handleEditDebtor(e) { const id = e.currentTarget.dataset.id; const path = getDebtorCollectionPath(); if (!path || !id) return; try { const debtorSnap = await getDoc(doc(db, path, id)); if (debtorSnap.exists()) { const data = debtorSnap.data(); debtorForm.debtorName.value = data.name || ''; debtorForm.debtorContact.value = data.contact || ''; debtorForm.debtorAmount.value = data.amount || 0; debtorForm.debtorCurrency.value = data.currency || 'THB'; debtorForm.debtorDateBorrowed.value = data.dateBorrowed || ''; debtorForm.debtorDateDue.value = data.dateDue || ''; debtorForm.debtorStatus.value = data.status || 'ยังไม่จ่าย'; debtorForm.debtorNotes.value = data.notes || ''; debtorModalTitle.textContent = 'แก้ไขข้อมูลลูกหนี้'; debtorForm.dataset.mode = 'edit'; debtorForm.dataset.id = id; debtorModal.classList.add('active'); } } catch (err) { showMessage(`เกิดข้อผิดพลาด: ${err.message}`, 'error'); } }
async function handleDeleteDebtor(e) { const id = e.currentTarget.dataset.id; const path = getDebtorCollectionPath(); if (!path || !id) return; const confirmed = await showCustomConfirm('ต้องการลบลูกหนี้รายนี้และประวัติทั้งหมด?'); if (confirmed) { try { const paymentsPath = getPaymentsCollectionPath(id); const paymentsSnapshot = await getDocs(collection(db, paymentsPath)); const deletePromises = paymentsSnapshot.docs.map(pDoc => deleteDoc(doc(db, paymentsPath, pDoc.id))); await Promise.all(deletePromises); await deleteDoc(doc(db, path, id)); showMessage('ลบข้อมูลสำเร็จ', 'success'); } catch (err) { showMessage(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, 'error'); } } }
function handleViewPayments(e) { const debtorId = e.currentTarget.dataset.id; const debtorName = e.currentTarget.dataset.name; const principalAmount = parseFloat(e.currentTarget.dataset.principal); openPaymentHistoryModal(debtorId, debtorName, principalAmount); }

// --- Search and Filter Event Listeners ---
searchInput.addEventListener('input', (e) => { renderDebtors(e.target.value, currentStatusFilter); });
statusFilterButtons.forEach(button => { button.addEventListener('click', () => { statusFilterButtons.forEach(btn => btn.classList.remove('active')); button.classList.add('active'); currentStatusFilter = button.dataset.filter; renderDebtors(searchInput.value, currentStatusFilter); }); });

// --- Smarter Dashboard & Export Logic ---
function updateSmarterDashboard() {
    if (!debtorsCache) return;
    const today = new Date(); today.setHours(0, 0, 0, 0); const todayISO = today.toISOString().split('T')[0];
    let totalOutstanding = 0, overdueCount = 0, overdueAmount = 0, dueTodayCount = 0, dueTodayAmount = 0, dueSoonCount = 0, dueSoonAmount = 0;
    debtorsCache.forEach(d => {
        const status = getCalculatedStatus(d); const principal = parseFloat(d.amount) || 0; const paid = parseFloat(d.totalPaid) || 0; const remaining = principal - paid;
        if (status !== 'จ่ายแล้ว' && status !== 'หนี้สูญ') { totalOutstanding += remaining; }
        if (status === 'เลยกำหนด') { overdueCount++; overdueAmount += remaining; }
        const dueDate = d.dateDue ? new Date(d.dateDue + 'T00:00:00') : null;
        if (dueDate) {
             if (d.dateDue === todayISO && status !== 'จ่ายแล้ว' && status !== 'หนี้สูญ') { dueTodayCount++; dueTodayAmount += remaining; }
            const sevenDaysFromNow = new Date(today); sevenDaysFromNow.setDate(today.getDate() + 7);
            if (dueDate > today && dueDate <= sevenDaysFromNow && status !== 'จ่ายแล้ว' && status !== 'หนี้สูญ') { dueSoonCount++; dueSoonAmount += remaining; }
        }
    });
    const formatCurrency = (num) => num.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + ' บาท';
    totalDebtAmountStat.textContent = formatCurrency(totalOutstanding); overdueStat.textContent = `${overdueCount} คน`; overdueAmountStat.textContent = formatCurrency(overdueAmount); dueTodayStat.textContent = `${dueTodayCount} คน`; dueTodayAmountStat.textContent = formatCurrency(dueTodayAmount); dueSoonStat.textContent = `${dueSoonCount} คน`; dueSoonAmountStat.textContent = formatCurrency(dueSoonAmount);
}

// FIXED: Added function to handle CSV export
function handleExportCsv() {
    if (debtorsCache.length === 0) { showMessage('ไม่มีข้อมูลสำหรับ Export', 'error'); return; }
    let csvContent = "\uFEFF"; // Add BOM for Excel compatibility with Thai characters
    const headers = ["ชื่อ", "ข้อมูลติดต่อ", "จำนวนเงิน", "สกุลเงิน", "วันที่ยืม", "กำหนดคืน", "สถานะ", "ยอดชำระแล้ว", "หมายเหตุ"];
    csvContent += headers.join(",") + "\r\n";
    debtorsCache.forEach(d => {
        const status = getCalculatedStatus(d);
        const row = [
            `"${(d.name || '').replace(/"/g, '""')}"`,
            `"${(d.contact || '').replace(/"/g, '""')}"`,
            d.amount || 0,
            d.currency || 'THB',
            d.dateBorrowed || '',
            d.dateDue || '',
            status,
            d.totalPaid || 0,
            `"${(d.notes || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\r\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "debtors_export.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showMessage('Export ข้อมูลเป็น CSV สำเร็จ!', 'success');
}

// --- Payment History Modal Logic ---
let currentPrincipalAmountForPaymentModal = 0;
async function openPaymentHistoryModal(debtorId, debtorName, principalAmount) {
    currentDebtorIdForPayment = debtorId; currentPrincipalAmountForPaymentModal = principalAmount;
    paymentModalTitle.textContent = `ประวัติชำระ: ${debtorName}`;
    paymentHistoryContent.innerHTML = '<p class="text-center py-4">กำลังโหลด...</p>';
    addPaymentForm.reset(); addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
    paymentDebtorIdInput.value = debtorId; paymentHistoryModal.classList.add('active');
    const paymentsPath = getPaymentsCollectionPath(debtorId); if (paymentListener) paymentListener();
    paymentListener = onSnapshot(query(collection(db, paymentsPath)), async (snapshot) => {
        let paymentsHtml = ''; let totalPaidForThisDebtor = 0;
        const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        paymentsData.sort((a, b) => new Date(b.datePaid) - new Date(a.datePaid));
        if (paymentsData.length === 0) { paymentsHtml = '<p class="text-center py-4 text-gray-500">ยังไม่มีรายการชำระ</p>'; }
        else {
            paymentsHtml = '<ul class="space-y-3 max-h-64 overflow-y-auto pr-2 -mr-2">';
            paymentsData.forEach(p => {
                const amount = parseFloat(p.amountPaid) || 0; totalPaidForThisDebtor += amount;
                const pDate = p.datePaid ? new Date(p.datePaid + 'T00:00:00').toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                paymentsHtml += `<li class="p-3 bg-white rounded-lg shadow-sm border border-gray-200"><div class="flex justify-between items-start"><div><p class="font-bold text-lg text-green-600">${amount.toLocaleString('th-TH')} บาท</p><p class="text-xs text-gray-500">จ่ายเมื่อ: ${pDate}</p>${p.paymentNote ? `<p class="text-xs text-gray-600 mt-1 pl-2 border-l-2 border-gray-200">"${p.paymentNote}"</p>` : ''}</div><button class="btn-icon text-red-400 hover:text-red-600 delete-payment" data-payment-id="${p.id}" title="ลบรายการนี้"><i class="fas fa-times-circle"></i></button></div></li>`;
            });
            paymentsHtml += '</ul>';
        }
        const remainingBalance = currentPrincipalAmountForPaymentModal - totalPaidForThisDebtor;
        paymentsHtml += `<div class="mt-4 pt-4 border-t border-gray-200 text-right space-y-1 font-semibold"><p>ยอดตั้งต้น: <span class="text-gray-800">${currentPrincipalAmountForPaymentModal.toLocaleString('th-TH')} บาท</span></p><p>รวมจ่ายแล้ว: <span class="text-green-600">${totalPaidForThisDebtor.toLocaleString('th-TH')} บาท</span></p><p>ยอดคงเหลือ: <span class="text-xl ${remainingBalance <= 0 ? 'text-green-600' : 'text-red-600'}">${remainingBalance.toLocaleString('th-TH')} บาท</span></p></div>`;
        paymentHistoryContent.innerHTML = paymentsHtml;
        attachPaymentDeleteListeners();
        await updateDebtorTotalPaid(debtorId, totalPaidForThisDebtor);
    });
}
async function updateDebtorTotalPaid(debtorId, totalPaid) { const debtorDocPath = getDebtorCollectionPath(); if (!debtorDocPath || !debtorId) return; try { await updateDoc(doc(db, debtorDocPath, debtorId), { totalPaid: totalPaid, lastUpdated: serverTimestamp() }); console.log(`อัปเดตยอดจ่ายรวมของลูกหนี้ ${debtorId} เป็น ${totalPaid}`); } catch (error) { console.error(`เกิดข้อผิดพลาดในการอัปเดตยอดจ่ายรวม:`, error); } }
function attachPaymentDeleteListeners() { document.querySelectorAll('.delete-payment').forEach(btn => btn.addEventListener('click', handleDeletePayment)); }
async function handleDeletePayment(e) { const paymentId = e.currentTarget.dataset.paymentId; const confirmed = await showCustomConfirm('ต้องการลบรายการชำระเงินนี้?'); if (confirmed) { const paymentsPath = getPaymentsCollectionPath(currentDebtorIdForPayment); try { await deleteDoc(doc(db, paymentsPath, paymentId)); showMessage('ลบรายการชำระเงินสำเร็จ', 'success'); } catch (err) { showMessage(`ลบรายการชำระเงินไม่สำเร็จ: ${err.message}`, 'error'); } } }
function closePaymentHistoryModalAction() { paymentHistoryModal.classList.remove('active'); if (paymentListener) { paymentListener(); paymentListener = null; } currentDebtorIdForPayment = null; }
closePaymentHistoryModal.addEventListener('click', closePaymentHistoryModalAction);
closePaymentHistoryModalUpper.addEventListener('click', closePaymentHistoryModalAction);
addPaymentForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const debtorId = paymentDebtorIdInput.value;
    const paymentData = { amountPaid: parseFloat(addPaymentForm.paymentAmount.value), datePaid: addPaymentForm.paymentDate.value, paymentNote: addPaymentForm.paymentNote.value.trim(), createdAt: serverTimestamp() };
    if (isNaN(paymentData.amountPaid) || paymentData.amountPaid <= 0 || !paymentData.datePaid) { showMessage('กรุณากรอกข้อมูลการชำระให้ถูกต้อง', 'error'); return; }
    const paymentsPath = getPaymentsCollectionPath(debtorId);
    try { await addDoc(collection(db, paymentsPath), paymentData); showMessage('เพิ่มรายการชำระเงินสำเร็จ!', 'success'); addPaymentForm.reset(); addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0]; }
    catch (err) { showMessage(`เพิ่มรายการชำระเงินไม่สำเร็จ: ${err.message}`, 'error'); }
});

// --- Custom Confirm Modal Logic ---
function createCustomConfirmModal() { if (document.getElementById('customConfirmModal')) return; confirmModalElement = document.getElementById('customConfirmModal'); customConfirmMessageEl = document.getElementById('customConfirmMessage'); customConfirmOkButton = document.getElementById('customConfirmOk'); customConfirmCancelButton = document.getElementById('customConfirmCancel'); }
function showCustomConfirm(message) {
    if (!confirmModalElement) createCustomConfirmModal();
    return new Promise((resolve) => {
        customConfirmMessageEl.textContent = message;
        confirmModalElement.classList.add('active');
        customConfirmOkButton.onclick = () => { confirmModalElement.classList.remove('active'); resolve(true); };
        customConfirmCancelButton.onclick = () => { confirmModalElement.classList.remove('active'); resolve(false); };
    });
}

// --- DOMContentLoaded Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM is ready. Bug fixes applied.");
    createCustomConfirmModal();
    const currentYearSpan = document.getElementById('currentYear');
    const currentYearSpanAuth = document.getElementById('currentYearAuth');
    if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();
    if (currentYearSpanAuth) currentYearSpanAuth.textContent = new Date().getFullYear();
});
