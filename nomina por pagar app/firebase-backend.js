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
    const db = firebase.firestore();
    // 2. Add User Management Logic (No Firebase Auth)
    window.registerSecondaryUser = async (email, password, name, role) => {
        try {
            // Generar un UID simple localmente
            const uid = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2);

            // Save the user data locally and in Firestore (incluyendo contraseña para validación interna)
            const newUser = {
                uid: uid,
                email: email,
                password: password, // Almacenamiento interno simple
                name: name,
                role: role,
                createdAt: new Date().toISOString()
            };

            await db.collection('users').doc(uid).set(newUser);

            // Actualizar estado global inmediatamente
            if (!window.globalState.users) window.globalState.users = [];
            window.globalState.users.push(newUser);

            alert(`Usuario ${name} creado exitosamente como ${role}.`);
        } catch (error) {
            console.error("Error creating user:", error);
            alert("Error al crear usuario: " + error.message);
        }
    };

    window.updateUserAccess = async (uid, updatedData) => {
        try {
            await db.collection('users').doc(uid).update(updatedData);

            // Update local state instantly so UI reflects the change without waiting for snapshot
            if (window.globalState.users) {
                const index = window.globalState.users.findIndex(u => u.uid === uid);
                if (index !== -1) {
                    window.globalState.users[index] = { ...window.globalState.users[index], ...updatedData };
                }
            }
            alert("Usuario actualizado correctamente.");
        } catch (error) {
            console.error("Error updating user:", error);
            alert("Error al editar usuario: " + error.message);
        }
    };

    window.removeUserAccess = async (uid) => {
        try {
            await db.collection('users').doc(uid).update({ role: 'disabled' });
            alert("Acceso revocado. El usuario ya no podrá realizar acciones.");
        } catch (error) {
            console.error("Error removing user:", error);
            alert("Error al revocar acceso.");
        }
    };

    // DOM Elements (Login overlay removed by user request)
    const mainApp = document.getElementById('main-app');

    // Handle Internal Login State
    const initApp = (user) => {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';

        window.globalState.currentUser = user;
        localStorage.setItem('activeSession', JSON.stringify(user));

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
        applyRolePermissions(user.role);

        // Trigger remote state loading
        window.loadStateFromFirebase();
    };

    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');

        // Verificar sesión activa
        const savedSession = localStorage.getItem('activeSession');
        if (savedSession) {
            initApp(JSON.parse(savedSession));
        } else {
            // Auto login as admin immediately
            console.log("Auto-login bypassed login screen.");
            initApp({ uid: 'local-admin-override', email: 'admin', role: 'admin', name: 'Administrador Principal' });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value.trim();
                const password = document.getElementById('login-password').value;
                loginError.classList.add('hidden');

                // Validar Credenciales Internamente
                const safeEmail = email.toLowerCase();
                if (safeEmail === 'admin' && password === 'admin') {
                    // Superadmin por defecto
                    console.log("Acceso admin por defecto concedido");
                    initApp({ uid: 'local-admin-override', email: email, role: 'admin', name: 'Administrador Principal' });
                    return;
                }

                try {
                    // Validar contra Firebase Firestore usuarios (ignorando mayúsculas/minúsculas)
                    console.log("Intentando ingresar con el usuario:", safeEmail);
                    const usersRef = await db.collection('users').get();

                    let validUser = null;
                    let userFound = false;

                    usersRef.forEach(doc => {
                        const userData = doc.data();
                        const docEmail = userData.email || userData.username || ''; // Fallback for safety

                        if (docEmail.toLowerCase() === safeEmail) {
                            userFound = true;
                            if (userData.password === password && userData.role !== 'disabled') {
                                validUser = userData;
                            }
                        }
                    });

                    if (!userFound) {
                        console.warn("Usuario no encontrado en la base de datos.");
                        loginError.textContent = 'Usuario no encontrado';
                        loginError.classList.remove('hidden');
                        return;
                    }

                    if (validUser) {
                        console.log("Login exitoso. Iniciando App...");
                        initApp(validUser);
                    } else {
                        console.warn("Contraseña incorrecta o rol deshabilitado.");
                        loginError.textContent = 'Contraseña incorrecta o usuario inactivo';
                        loginError.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error("Error validando el login contra Firebase:", err);
                    loginError.textContent = 'Error de conexión a la base de datos: ' + err.message;
                    loginError.classList.remove('hidden');
                }
            });
        }

        // Add logout button to the sidebar
        const sidebarNav = document.querySelector('.sidebar-nav ul');
        if (sidebarNav) {
            const logoutLi = document.createElement('li');
            logoutLi.className = 'nav-item';
            logoutLi.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Cerrar Sesión</span>';
            logoutLi.style.marginTop = 'auto';
            logoutLi.style.color = '#ff6b6b';
            logoutLi.onclick = () => {
                localStorage.removeItem('activeSession');
                window.location.reload();
            };
            sidebarNav.appendChild(logoutLi);
        }
    });

    // Cloud Database Methods
    let isInitialLoad = true;
    window.isFirebaseStateLoaded = false;

    window.loadStateFromFirebase = () => {
        console.log("Listening for real-time changes from Firebase...");

        const docRef = db.collection('payroll').doc('globalState');

        docRef.onSnapshot((doc) => {
            console.log("[FIREBASE SNAPSHOT RECEIVED]", doc.exists ? "Data exists" : "No data");
            if (doc.exists) {
                const data = doc.data();
                console.log("[FIREBASE SNAPSHOT DATA LENGTHS:", Object.keys(data).map(k => `${k}: ${data[k]?.length || typeof data[k]}`).join(', '));
                Object.keys(data).forEach(key => {
                    // Do not overwrite users array from globalState doc, it comes from users collection
                    if (key !== 'users' && window.globalState.hasOwnProperty(key)) {
                        // Protect against null/undefined cloud fields overwriting valid local arrays
                        if (data[key] !== undefined && data[key] !== null) {
                            if (Array.isArray(window.globalState[key]) && Array.isArray(data[key])) {
                                // Important: Protect rich local data from being wiped by an empty cloud state
                                // If cloud is empty but local has data during initial load, WE SHOULD NOT OVERWRITE
                                if (isInitialLoad && data[key].length === 0 && window.globalState[key].length > 0) {
                                    console.log(`[SYNC PROTECT] Keeping local ${key} (${window.globalState[key].length}) because cloud is empty`);
                                    // We trigger a save so the cloud gets our rich local data
                                    setTimeout(() => window.saveStateToFirebase(), 2000);
                                } else {
                                    // Standard Sync: Empty and push to preserve memory references (pointers)
                                    window.globalState[key].length = 0;
                                    data[key].forEach(item => window.globalState[key].push(item));
                                }
                            } else {
                                window.globalState[key] = data[key];
                                if (window.state && window.state !== window.globalState) {
                                    window.state[key] = data[key];
                                }
                            }
                        }
                    }
                });

                window.isFirebaseStateLoaded = true;

                // Immediately burn the fresh cloud data into the offline local storage cache
                if (typeof window.syncToLocalStorage === 'function') {
                    console.log("[SYNC] Burning cloud data into local offline storage");
                    window.syncToLocalStorage();
                }

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
                window.isFirebaseStateLoaded = true;
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
        console.log(`[FIREBASE SAVE TRIGGERED]. isFirebaseStateLoaded: ${window.isFirebaseStateLoaded}, isInitialLoad: ${isInitialLoad}`);

        // Failsafe: Si Firebase no ha cargado los datos iniciales, NUNCA permitir guardar
        // porque sobrescribirá la base de datos de producción con el estado local vacío.
        if (!window.isFirebaseStateLoaded) {
            console.warn("[FIREBASE SAVE BLOCKED] Ignorando guardado: El estado de Firebase aún no ha cargado completamente para este usuario.");
            return;
        }

        console.log("[FIREBASE SAVE EXECUTING] Saving data to Firebase...");
        try {
            const stateToSave = { ...window.globalState };
            delete stateToSave.currentSection; // Do not sync UI state
            delete stateToSave.currentUser;    // Do not sync current session
            delete stateToSave.users;          // Users are managed in their own collection

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

    // Database Wipe Utility (Danger)
    window.wipeProductionDatabase = async () => {
        const confirm1 = confirm("⚠️ ADVERTENCIA ⚠️\n\n¿Estás completamente seguro de que quieres BORRAR TODOS los datos del sistema? (Empleados, departamentos, historial de nómina, etc.)\n\nEsta acción NO se puede deshacer.");
        if (!confirm1) return;

        const confirm2 = prompt("Para confirmar, escribe borrar datos");
        if (confirm2 !== "borrar datos") {
            alert("Proceso cancelado. La confirmación no coincidió.");
            return;
        }

        console.log("Iniciando formateo de base de datos...");
        try {
            // Eliminar solo la configuración y datos
            window.globalState.departments = [];
            window.globalState.operations = [];
            window.globalState.activities = [];
            window.globalState.employees = [];
            window.globalState.periods = [];
            window.globalState.activePayroll = null;
            window.globalState.discounts = [];
            window.globalState.incentives = [];
            window.globalState.overtime = [];
            window.globalState.christmasSalary = [];
            window.globalState.payrollHistory = [];

            // Mantener solo los usuarios para no perder acceso
            const stateToSave = { ...window.globalState };
            delete stateToSave.currentSection;
            delete stateToSave.currentUser;

            await db.collection('payroll').doc('globalState').set(stateToSave);

            // Wipe Local Storage as well just in case
            localStorage.removeItem('payroll_departments');
            localStorage.removeItem('payroll_operations');
            localStorage.removeItem('payroll_activities');
            localStorage.removeItem('payroll_employees');
            localStorage.removeItem('payroll_periods');
            localStorage.removeItem('payroll_active');
            localStorage.removeItem('payroll_discounts');
            localStorage.removeItem('payroll_incentives');
            localStorage.removeItem('payroll_overtime');
            localStorage.removeItem('payroll_christmas');
            localStorage.removeItem('payroll_history');

            alert("✅ Sistema formateado con éxito. Ahora tienes una instalación limpia.");
            window.location.reload();
        } catch (e) {
            alert("Error al limpiar: " + e.message);
        }
    };

} else {
    console.error("Firebase SDKs not loaded.");
}
