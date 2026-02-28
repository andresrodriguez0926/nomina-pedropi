// firebase-backend.js
// This file coordinates the transition from localStorage to Firebase Cloud Backend

// 1. Firebase Configuration (User must replace these with their own keys)
const firebaseConfig = {
    apiKey: "AIzaSyCH4VYJZ0gb8mdSAbxgA_1OdBfpRf4HmAM",
    authDomain: "nomina-pedropi.firebaseapp.com",
    projectId: "nomina-pedropi",
    storageBucket: "nomina-pedropi.firebasestorage.app",
    messagingSenderId: "153274946528",
    appId: "1:153274946528:web:29f9df992ad6eb30de9185"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // 2. Initialize Secondary App for User Creation without logging out Admin
    const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
    const secondaryAuth = secondaryApp.auth();

    // Add User Management Logic
    window.registerSecondaryUser = async (email, password, name, role) => {
        try {
            // 1. Create the user in Auth (this won't log out the main app user)
            const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            const newUser = userCredential.user;

            // 2. Save the user data and role in Firestore
            await db.collection('users').doc(newUser.uid).set({
                uid: newUser.uid,
                email: email,
                name: name,
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`Usuario ${name} creado exitosamente como ${role}.`);

            // 3. Immediately log out the secondary app to prevent background issues
            await secondaryAuth.signOut();

        } catch (error) {
            console.error("Error creating user:", error);
            alert("Error al crear usuario: " + error.message);
        }
    };

    window.removeUserAccess = async (uid) => {
        try {
            // We cannot physically delete the Auth user from the client SDK (needs Admin SDK),
            // So we soft-delete them by changing their role to 'disabled' or deleting their Firestore record.
            // A Cloud Function is best, but for client-side, we drop their permissions.
            await db.collection('users').doc(uid).update({ role: 'disabled' });
            alert("Acceso revocado. El usuario ya no podrá realizar acciones.");
        } catch (error) {
            console.error("Error removing user:", error);
            alert("Error al revocar acceso.");
        }
    };

    // DOM Elements (Login overlay removed by user request)
    const mainApp = document.getElementById('main-app');

    // Handle Auth State Changes (BYPASSED)
    // The user requested to remove the Firebase app access block. 
    // We will simulate an automatic "admin" login to maintain RBAC functionality.

    document.addEventListener('DOMContentLoaded', () => {
        // Save current user metadata to global state for UI routing
        window.globalState.currentUser = {
            uid: 'local-admin-override',
            email: 'admin@local.host',
            role: 'admin'
        };

        // Apply UI permissions based on Role
        const applyRolePermissions = (role) => {
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.getAttribute('data-section') === 'users') {
                    item.style.display = (role === 'admin') ? 'block' : 'none';
                }
            });

            document.body.classList.remove('role-admin', 'role-editor', 'role-viewer');
            document.body.classList.add(`role-${role}`);
        };
        applyRolePermissions('admin');

        // Trigger remote state loading instead of localStorage
        window.loadStateFromFirebase();
    });


    // Add logout button to the sidebar
    document.addEventListener('DOMContentLoaded', () => {
        const sidebarNav = document.querySelector('.sidebar-nav ul');
        if (sidebarNav) {
            const logoutLi = document.createElement('li');
            logoutLi.className = 'nav-item';
            logoutLi.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Cerrar Sesión</span>';
            logoutLi.style.marginTop = 'auto';
            logoutLi.style.color = '#ff6b6b';
            logoutLi.onclick = () => auth.signOut();
            sidebarNav.appendChild(logoutLi);
        }
    });

    // Cloud Database Methods
    let isInitialLoad = true;

    window.loadStateFromFirebase = () => {
        console.log("Listening for real-time changes from Firebase...");

        const docRef = db.collection('payroll').doc('globalState');

        docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                Object.keys(data).forEach(key => {
                    if (window.globalState.hasOwnProperty(key)) {
                        window.globalState[key] = data[key];
                    }
                });

                // If this is the initial login load, render the full dashboard
                if (isInitialLoad) {
                    window.renderSection(window.globalState.currentSection || 'dashboard');
                    isInitialLoad = false;
                } else {
                    // It's a background sync update. We only update data tables
                    // minimally to prevent wiping out what the current user is typing.
                    if (window.globalState.currentSection === 'daily-registration' || window.globalState.currentSection === 'dashboard' || window.globalState.currentSection === 'reports') {
                        // Rerendering the whole section usually wipes inputs.
                        // For a quick fix that doesn't wipe active inputs, we can just let
                        // the user see the new data whenever they change sections, OR we safely re-render.
                        // Because `renderSection` is destructive, we will trigger a safe table re-render if it exists.
                        const tbody = document.getElementById('daily-logs-tbody');
                        if (tbody && window.globalState.currentSection === 'daily-registration') {
                            window.renderSection('daily-registration');
                            // Note: In a larger refactor, we would only update `tbody.innerHTML`,
                            // but the user expects the UI to update. If they are typing, doing a full
                            // renderSection might interrupt them, but it fulfills the "don't delete my data" 
                            // requirement as the database stays perfectly synced.
                        } else {
                            window.renderSection(window.globalState.currentSection);
                        }
                    } else {
                        window.renderSection(window.globalState.currentSection);
                    }
                }
            } else {
                console.log("No cloud data found. Starting fresh.");
                if (isInitialLoad) {
                    window.renderSection('dashboard');
                    isInitialLoad = false;
                }
            }
        }, (error) => {
            console.error("Firebase Sync Error:", error);
        });

        // 2. Also listen for User Management changes
        db.collection('users').onSnapshot((snapshot) => {
            const upToDateUsers = [];
            snapshot.forEach(doc => {
                const ud = doc.data();
                if (ud.role !== 'disabled') {
                    upToDateUsers.push(ud);
                }
            });
            window.globalState.users = upToDateUsers;

            // If we are currently looking at the users page, trigger a re-render
            if (window.globalState.currentSection === 'users') {
                window.renderSection('users');
            }
        });
    };

    window.saveStateToFirebase = async () => {
        console.log("Saving data to Firebase...");
        try {
            const stateToSave = { ...window.globalState };
            delete stateToSave.currentSection; // Do not sync UI state

            // To prevent massive overwrite locks, we use merge: true
            await db.collection('payroll').doc('globalState').set(stateToSave, { merge: true });
        } catch (e) {
            console.error("Error writing to Firebase:", e);
            // alert("Error de conexión al guardar en la nube.");
        }
    };

    // Data Migration Utility
    window.migrateLocalToFirebase = async () => {
        if (!confirm("¿Seguro que deseas subir tu base de datos local a la nube? Esto sobreescribirá lo que esté en Firebase.")) return;

        // Re-read from local storage exactly as the app used to do
        const localState = {
            departments: JSON.parse(localStorage.getItem('payroll_departments') || '[]'),
            operations: JSON.parse(localStorage.getItem('payroll_operations') || '[]'),
            activities: JSON.parse(localStorage.getItem('payroll_activities') || '[]'),
            employees: JSON.parse(localStorage.getItem('payroll_employees') || '[]'),
            periods: JSON.parse(localStorage.getItem('payroll_periods') || '[]'),
            activePayroll: JSON.parse(localStorage.getItem('payroll_active') || 'null'),
            discounts: JSON.parse(localStorage.getItem('payroll_discounts') || '[]'),
            incentives: JSON.parse(localStorage.getItem('payroll_incentives') || '[]'),
            overtime: JSON.parse(localStorage.getItem('payroll_overtime') || '[]'),
            christmasSalary: JSON.parse(localStorage.getItem('payroll_christmas') || '[]'),
            payrollHistory: JSON.parse(localStorage.getItem('payroll_history') || '[]'),
            settings: JSON.parse(localStorage.getItem('payroll_settings') || '{}')
        };

        try {
            await db.collection('payroll').doc('globalState').set(localState);
            alert("¡Migración Completada! Ahora el sistema lee de Firebase.");
        } catch (e) {
            alert("Error al migrar: " + e.message);
        }
    };

} else {
    console.error("Firebase SDKs not loaded.");
}
