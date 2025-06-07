// script.js (Version 3 - With Status Badges Logic)

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
const paymentDebtorIdInput = document.getElementById('paymentDebtorId');
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
    if (!userId) { console.error("User ID not available."); return null; }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors`;
}

function getPaymentsCollectionPath(debtorId) {
     if (!userId || !debtorId) { console.error("User ID or Debtor ID not available."); return null; }
    return `artifacts/${EFFECTIVE_APP_ID}/users/${userId}/debtors/${debtorId}/payments`;
}

function createCustomConfirmModal() {
    if (document.getElementById('customConfirmModal')) return;
    confirmModalElement = document.createElement('div');
    confirmModalElement.id = 'customConfirmModal';
    confirmModalElement.className = 'modal fixed inset-0 bg-gray-800 bg-opacity-60 h-full w-full items-center justify-center p-4 z-[100]';
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
        customConfirmOkButton.onclick = () => { confirmModalElement.classList.remove('active'); resolve(true); };
        customConfirmCancelButton.onclick = () => { confirmModalElement.classList.remove('active'); resolve(false); };
    });
}

// --- Authentication Logic ---
setPersistence(auth, browserLocalPersistence).then(initializeAuthListener).catch(initializeAuthListener);

function initializeAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            console.log("ผู้ใช้ล็อกอินแล้ว:", userId);
            userEmailDisplay.textContent = user.email || "N/A";
            currentUserIdDisplay.textContent = `ID: ${userId}`;
            authSection.style.display = 'none';
            appSection.style.display = 'block';
            loadDebtors();
        } else {
            userId = null;
            console.log("ผู้ใช้ออกจากระบบ");
            userEmailDisplay.textContent = '';
            currentUserIdDisplay.textContent = '';
            authSection.style.display = 'flex';
            appSection.style.display = 'none';
            if (debtorsListener) { debtorsListener(); debtorsListener = null; }
            debtorsCache = [];
            renderDebtors();
        }
    });
}

// --- Event Listeners for Auth ---
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value);
        showMessage('เข้าสู่ระบบสำเร็จ!', 'success');
    } catch (error) { showMessage(`ล็อกอินไม่สำเร็จ: ${error.code}`, 'error'); }
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await createUserWithEmailAndPassword(auth, registerForm.email.value, registerForm.password.value);
        showMessage('ลงทะเบียนสำเร็จ!', 'success');
        showLogin();
    } catch (error) { showMessage(`ลงทะเบียนไม่สำเร็จ: ${error.code}`, 'error'); }
});

logoutButton?.addEventListener('click', () => signOut(auth));
showRegisterLink?.addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
showLoginLink?.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
function showRegister() { loginForm.style.display = 'none'; registerForm.style.display = 'block'; }
function showLogin() { registerForm.style.display = 'none'; loginForm.style.display = 'block'; }

// --- Debtor Management Logic ---
addDebtorButton?.addEventListener('click', () => {
    debtorModal.classList.add('active');
    debtorModalTitle.textContent = 'เพิ่มลูกหนี้ใหม่';
    debtorForm.reset();
    debtorForm.debtorDateBorrowed.value = new Date().toISOString().split('T')[0];
    debtorForm.dataset.mode = 'add';
    delete debtorForm.dataset.id;
});

function closeDebtorModalAction() { debtorModal.classList.remove('active'); }
cancelDebtorModal?.addEventListener('click', closeDebtorModalAction);
closeDebtorModalUpper?.addEventListener('click', closeDebtorModalAction);

debtorForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;

    const debtorData = {
        name: debtorForm.debtorName.value.trim(),
        contact: debtorForm.debtorContact.value.trim(),
        amount: parseFloat(debtorForm.debtorAmount.value),
        currency: debtorForm.debtorCurrency.value,
        dateBorrowed: debtorForm.debtorDateBorrowed.value,
        dateDue: debtorForm.debtorDateDue.value,
        status: debtorForm.debtorStatus.value,
        notes: debtorForm.debtorNotes.value.trim(),
        lastUpdated: serverTimestamp(),
        totalPaid: debtorForm.dataset.mode === 'add' ? 0 : (debtorsCache.find(d => d.id === debtorForm.dataset.id)?.totalPaid || 0)
    };

    try {
        if (debtorForm.dataset.mode === 'add') {
            await addDoc(collection(db, debtorCollectionPath), debtorData);
            showMessage('เพิ่มลูกหนี้สำเร็จ!', 'success');
        } else {
            const debtorId = debtorForm.dataset.id;
            await setDoc(doc(db, debtorCollectionPath, debtorId), debtorData, { merge: true });
            showMessage('แก้ไขข้อมูลลูกหนี้สำเร็จ!', 'success');
        }
        closeDebtorModalAction();
    } catch (error) {
        showMessage(`บันทึกข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    }
});

function loadDebtors() {
    const debtorCollectionPath = getDebtorCollectionPath();
    if (!debtorCollectionPath) return;
    if (debtorsListener) debtorsListener();

    const q = query(collection(db, debtorCollectionPath));
    debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';

    debtorsListener = onSnapshot(q, (snapshot) => {
        debtorsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDebtors();
        updateDashboard();
        renderCalendar();
    }, (error) => {
        console.error("Error loading debtors:", error);
        debtorTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>';
    });
}

function renderDebtors() {
    if (!debtorTableBody) return;
    
    let displayDebtors = [...debtorsCache];
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const sortBy = sortBySelect ? sortBySelect.value : 'name_asc';

    if (searchTerm) {
        displayDebtors = displayDebtors.filter(d =>
            d.name.toLowerCase().includes(searchTerm) ||
            d.contact?.toLowerCase().includes(searchTerm)
        );
    }
    
    const [sortField, sortOrder] = sortBy.split('_');
    displayDebtors.sort((a, b) => {
        let valA = a[sortField] || 0;
        let valB = b[sortField] || 0;
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    debtorTableBody.innerHTML = '';
    if (displayDebtors.length === 0) {
        debtorTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-gray-500">ไม่พบข้อมูลลูกหนี้</td></tr>`;
        return;
    }

    displayDebtors.forEach(debtor => {
        const row = debtorTableBody.insertRow();
        row.className = 'bg-white hover:bg-gray-50 transition-colors duration-150';
        
        // --- ✨ NEW Status Logic ---
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date for comparison
        const dueDate = debtor.dateDue ? new Date(debtor.dateDue) : null;
        if (dueDate) dueDate.setHours(0, 0, 0, 0); // Normalize due date

        const principalAmount = parseFloat(debtor.amount) || 0;
        const totalPaid = parseFloat(debtor.totalPaid) || 0;
        
        let statusText = '';
        let statusBadgeClass = '';

        if (debtor.status === 'หนี้สูญ') {
            statusText = 'หนี้สูญ';
            statusBadgeClass = 'status-bad-debt';
        } else if (totalPaid >= principalAmount && principalAmount > 0) {
            statusText = 'จ่ายแล้ว';
            statusBadgeClass = 'status-paid';
        } else if (totalPaid > 0) {
            statusText = 'จ่ายบางส่วน';
            statusBadgeClass = 'status-partial';
        } else { // ยังไม่ได้จ่าย
            if (dueDate && dueDate < today) {
                statusText = 'เกินกำหนด';
                statusBadgeClass = 'status-overdue'; // Brighter red for overdue
            } else if (dueDate && dueDate.getTime() === today.getTime()) {
                statusText = 'ครบกำหนดวันนี้';
                statusBadgeClass = 'status-due-today';
            } else {
                statusText = 'ยังไม่จ่าย';
                statusBadgeClass = 'status-unpaid'; // Default red for unpaid
            }
        }
        // --- End of NEW Status Logic ---

        const lastUpdated = debtor.lastUpdated?.toDate ? new Date(debtor.lastUpdated.toDate()).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A';
        row.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${debtor.name}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.contact || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(principalAmount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ${debtor.currency || 'THB'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.dateBorrowed || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${debtor.dateDue || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm"><span class="status-badge ${statusBadgeClass}">${statusText}</span></td>
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
    document.querySelectorAll('.edit-debtor').forEach(btn => btn.addEventListener('click', handleEditDebtor));
    document.querySelectorAll('.delete-debtor').forEach(btn => btn.addEventListener('click', handleDeleteDebtor));
    document.querySelectorAll('.view-payments').forEach(btn => btn.addEventListener('click', handleViewPayments));
}

async function handleEditDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const debtor = debtorsCache.find(d => d.id === id);
    if (debtor) {
        debtorForm.debtorName.value = debtor.name || '';
        debtorForm.debtorContact.value = debtor.contact || '';
        debtorForm.debtorAmount.value = debtor.amount || 0;
        debtorForm.debtorCurrency.value = debtor.currency || 'THB';
        debtorForm.debtorDateBorrowed.value = debtor.dateBorrowed || '';
        debtorForm.debtorDateDue.value = debtor.dateDue || '';
        debtorForm.debtorStatus.value = debtor.status || 'ยังไม่จ่าย';
        debtorForm.debtorNotes.value = debtor.notes || '';
        debtorModalTitle.textContent = 'แก้ไขข้อมูลลูกหนี้';
        debtorForm.dataset.mode = 'edit';
        debtorForm.dataset.id = id;
        debtorModal.classList.add('active');
    }
}

async function handleDeleteDebtor(e) {
    const id = e.currentTarget.dataset.id;
    const path = getDebtorCollectionPath();
    if (!path || !id) return;
    const confirmed = await showCustomConfirm('ต้องการลบลูกหนี้รายนี้และประวัติการชำระเงินทั้งหมดหรือไม่?');
    if (confirmed) {
        try {
            const paymentsPath = getPaymentsCollectionPath(id);
            const paymentsSnapshot = await getDocs(collection(db, paymentsPath));
            await Promise.all(paymentsSnapshot.docs.map(pDoc => deleteDoc(doc(db, paymentsPath, pDoc.id))));
            await deleteDoc(doc(db, path, id));
            showMessage('ลบลูกหนี้สำเร็จ', 'success');
        } catch (err) { showMessage(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function handleViewPayments(e) {
    const debtorId = e.currentTarget.dataset.id;
    const debtorName = e.currentTarget.dataset.name;
    const principalAmount = parseFloat(e.currentTarget.dataset.principal);
    openPaymentHistoryModal(debtorId, debtorName, principalAmount);
}

searchInput?.addEventListener('input', renderDebtors);
sortBySelect?.addEventListener('change', renderDebtors);


// --- Dashboard, Calendar, and Export ---
function updateDashboard() {
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
    totalDebtorsStat.textContent = debtorsCache.length;
    totalDebtAmountStat.textContent = Math.max(0, outstandingDebt).toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' บาท';
    totalPaidAmountStat.textContent = totalPaidOverall.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' บาท';
}

function renderCalendar() {
    if (!calendarView) return;
    const upcoming = debtorsCache
        .filter(d => {
            const principal = parseFloat(d.amount) || 0;
            const totalPaid = parseFloat(d.totalPaid) || 0;
            return totalPaid < principal && d.status !== 'หนี้สูญ' && d.dateDue && new Date(d.dateDue) >= new Date(new Date().toDateString());
        })
        .sort((a,b) => new Date(a.dateDue) - new Date(b.dateDue))
        .slice(0,5);

    if (upcoming.length > 0) {
        calendarView.innerHTML = '<ul class="space-y-1 mt-1">' + upcoming.map(d => `
            <li class="text-gray-700 text-xs sm:text-sm">🗓️ <span class="font-semibold">${d.name}</span> - ${new Date(d.dateDue).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}</li>
        `).join('') + '</ul>';
    } else {
        calendarView.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">ไม่มีรายการครบกำหนดเร็วๆ นี้</p>';
    }
}

exportCsvButton?.addEventListener('click', () => {
    if (debtorsCache.length === 0) { showMessage('ไม่มีข้อมูลสำหรับ Export', 'error'); return; }
    let csv = "\uFEFFชื่อ,ข้อมูลติดต่อ,จำนวนเงิน,สกุลเงิน,วันที่ยืม,วันที่ครบกำหนด,สถานะ,หมายเหตุ,ยอดชำระแล้ว\n";
    debtorsCache.forEach(d => {
        csv += `"${d.name||''}","${d.contact||''}",${d.amount||0},"${d.currency||'THB'}","${d.dateBorrowed||''}","${d.dateDue||''}","${d.status||''}","${d.notes||''}",${d.totalPaid||0}\r\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "debtors_export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
});

// --- Payment History Modal ---
let currentPrincipalAmountForPaymentModal = 0;

function openPaymentHistoryModal(debtorId, debtorName, principalAmount) {
    currentDebtorIdForPayment = debtorId;
    currentPrincipalAmountForPaymentModal = principalAmount;
    paymentModalTitle.textContent = `ประวัติชำระ - ${debtorName}`;
    paymentHistoryContent.innerHTML = '<p class="text-center py-4">กำลังโหลด...</p>';
    addPaymentForm.reset();
    addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
    paymentDebtorIdInput.value = debtorId;
    paymentHistoryModal.classList.add('active');

    const paymentsPath = getPaymentsCollectionPath(debtorId);
    if (!paymentsPath) return;
    if (paymentListener) paymentListener();

    paymentListener = onSnapshot(query(collection(db, paymentsPath)), async (snapshot) => {
        const paymentsData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})).sort((a,b) => new Date(b.datePaid) - new Date(a.datePaid));
        let totalPaidForThisDebtor = paymentsData.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
        
        const remainingBalance = currentPrincipalAmountForPaymentModal - totalPaidForThisDebtor;

        paymentHistoryContent.innerHTML = (paymentsData.length === 0) 
            ? '<p class="text-center py-4 text-gray-500">ยังไม่มีรายการชำระ</p>'
            : '<ul class="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2 bg-gray-50">' + paymentsData.map(p => `
                <li class="p-2 bg-white rounded shadow-sm border border-gray-200 flex justify-between items-center">
                    <div>
                        <p class="text-xs font-semibold text-green-600">จ่ายเมื่อ: ${new Date(p.datePaid).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'})}</p>
                        <p class="text-md font-bold">${(p.amountPaid||0).toLocaleString('th-TH')} บาท</p>
                        ${p.paymentNote ? `<p class="text-xs text-gray-500 mt-1">หมายเหตุ: ${p.paymentNote}</p>` : ''}
                    </div>
                    <button class="btn-icon text-red-400 hover:text-red-600 delete-payment" data-payment-id="${p.id}"><i class="fas fa-times-circle"></i></button>
                </li>`).join('') + '</ul>';

        paymentHistoryContent.innerHTML += `
            <div class="mt-3 text-sm text-right space-y-1 font-semibold">
                <p>ยอดตั้งต้น: ${currentPrincipalAmountForPaymentModal.toLocaleString('th-TH')} บาท</p>
                <p>รวมจ่ายแล้ว: ${totalPaidForThisDebtor.toLocaleString('th-TH')} บาท</p>
                <p class="${remainingBalance <= 0 ? 'text-green-600' : 'text-red-600'}">ยอดคงเหลือ: ${remainingBalance.toLocaleString('th-TH')} บาท</p>
            </div>
        `;

        document.querySelectorAll('.delete-payment').forEach(btn => btn.addEventListener('click', handleDeletePayment));
        await updateDebtorStatusAndTotalPaid(debtorId, totalPaidForThisDebtor, currentPrincipalAmountForPaymentModal);
    });
}

async function updateDebtorStatusAndTotalPaid(debtorId, totalPaid, principal) {
    const debtorDocPath = getDebtorCollectionPath();
    if (!debtorDocPath || !debtorId) return;

    const debtorRef = doc(db, debtorDocPath, debtorId);
    const currentDebtorSnap = await getDoc(debtorRef);
    if (!currentDebtorSnap.exists()) return;

    // Only auto-update status if not manually set to 'หนี้สูญ'
    let newStatus = currentDebtorSnap.data().status;
    if (newStatus !== 'หนี้สูญ') {
        if (totalPaid >= principal && principal > 0) newStatus = 'จ่ายแล้ว';
        else if (totalPaid > 0) newStatus = 'จ่ายบางส่วน';
        else newStatus = 'ยังไม่จ่าย';
    }
    
    await updateDoc(debtorRef, { status: newStatus, totalPaid: totalPaid, lastUpdated: serverTimestamp() });
}

async function handleDeletePayment(e) {
    const paymentId = e.currentTarget.dataset.paymentId;
    if (!currentDebtorIdForPayment || !paymentId) return;
    const confirmed = await showCustomConfirm('ต้องการลบรายการชำระเงินนี้หรือไม่?');
    if (confirmed) {
        const paymentsPath = getPaymentsCollectionPath(currentDebtorIdForPayment);
        try {
            await deleteDoc(doc(db, paymentsPath, paymentId));
            showMessage('ลบรายการชำระเงินสำเร็จ', 'success');
        } catch (err) { showMessage(`ลบไม่สำเร็จ: ${err.message}`, 'error'); }
    }
}

function closePaymentHistoryModalAction() {
    paymentHistoryModal.classList.remove('active');
    if (paymentListener) { paymentListener(); paymentListener = null; }
}
closePaymentHistoryModal?.addEventListener('click', closePaymentHistoryModalAction);
closePaymentHistoryModalUpper?.addEventListener('click', closePaymentHistoryModalAction);

addPaymentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const debtorId = paymentDebtorIdInput.value;
    const paymentsPath = getPaymentsCollectionPath(debtorId);
    if (!paymentsPath) return;

    const paymentData = {
        amountPaid: parseFloat(addPaymentForm.paymentAmount.value),
        datePaid: addPaymentForm.paymentDate.value,
        paymentNote: addPaymentForm.paymentNote.value.trim(),
        createdAt: serverTimestamp()
    };
    try {
        await addDoc(collection(db, paymentsPath), paymentData);
        showMessage('เพิ่มรายการชำระเงินสำเร็จ!', 'success');
        addPaymentForm.reset();
        addPaymentForm.paymentDate.value = new Date().toISOString().split('T')[0];
    } catch (err) { showMessage(`เพิ่มรายการไม่สำเร็จ: ${err.message}`, 'error'); }
});


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM พร้อมแล้ว เริ่มการทำงาน!");
    createCustomConfirmModal();
    document.getElementById('currentYear').textContent = new Date().getFullYear();
});
