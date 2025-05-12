document.addEventListener('DOMContentLoaded', () => {
    // API Base URL
    const API_BASE_URL = "https://mindicador.cl/api";

    // Elementos del DOM
    const conversionForm = document.getElementById('conversion-form');
    const origenIndicadorSelect = document.getElementById('origen-indicador');
    const destinoIndicadorSelect = document.getElementById('destino-indicador');
    const cantidadConvertirInput = document.getElementById('cantidad-convertir');
    const fechaConversionInput = document.getElementById('fecha-conversion');
    const conversionResultadoDiv = document.getElementById('conversion-resultado');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    const copyPopupEl = document.getElementById('copy-popup');
    const copyPopupMessageEl = document.getElementById('copy-popup-message');
    let popupTimeoutId = null;

    // Elementos para el tema
    const themeCheckbox = document.getElementById('theme-checkbox');
    const bodyElement = document.body;

    // --- Lógica de Tema (Modo Oscuro/Claro) ---
    function setTheme(theme) {
        if (theme === 'dark') {
            bodyElement.classList.add('dark-mode');
            themeCheckbox.checked = true;
        } else {
            bodyElement.classList.remove('dark-mode');
            themeCheckbox.checked = false;
        }
        localStorage.setItem('themePreference', theme);
    }

    themeCheckbox.addEventListener('change', () => {
        if (themeCheckbox.checked) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    });

    const savedTheme = localStorage.getItem('themePreference');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        setTheme(savedTheme);
    } else if (prefersDarkScheme) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
    // --- Fin Lógica de Tema ---

    // Configurar fecha por defecto a hoy
    const today = new Date().toISOString().split('T')[0];
    fechaConversionInput.value = today;

    // Abrir el selector de fecha al hacer clic en el campo
    fechaConversionInput.addEventListener('click', function(event) {
        try {
            this.showPicker();
        } catch (error) {
            console.warn("showPicker() no está disponible o no se pudo ejecutar: ", error);
        }
    });

    // --- Funciones Auxiliares ---
    function showLoading() {
        loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    function formatDateForAPI(dateString) {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return `${day}-${month}-${year}`;
    }

    function formatNumber_esCL(number, minDecimals = 2, maxDecimals = 2) {
        if (typeof number !== 'number' || isNaN(number)) {
            return String(number); 
        }
        const options = {
            minimumFractionDigits: minDecimals,
            maximumFractionDigits: maxDecimals,
        };
        return number.toLocaleString('es-CL', options);
    }

    function displayMessage(element, message, type = 'info') {
        element.innerHTML = `<p class="${type}">${message}</p>`;
    }
    
    function showCopyFeedbackPopup(message, isError = false) {
        if (popupTimeoutId) {
            clearTimeout(popupTimeoutId);
        }
        copyPopupMessageEl.textContent = message;
        copyPopupEl.classList.remove('error', 'show'); 
        if (isError) {
            copyPopupEl.classList.add('error');
        }
        void copyPopupEl.offsetWidth; 
        copyPopupEl.classList.add('show');
        popupTimeoutId = setTimeout(() => {
            copyPopupEl.classList.remove('show');
        }, 2500);
    }

    function createCopyButton(valueToCopy, parentContainer) {
        const formattedValueForCopy = formatNumber_esCL(valueToCopy, 2, 5); 

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'copy-button-container';

        const button = document.createElement('button');
        button.className = 'copy-button-enhanced';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'copy-icon';
        iconSpan.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
        `;

        const textSpan = document.createElement('span');
        textSpan.textContent = 'Copiar Valor';

        button.appendChild(iconSpan);
        button.appendChild(textSpan);
        
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            navigator.clipboard.writeText(formattedValueForCopy).then(() => {
                showCopyFeedbackPopup('¡Valor Copiado!');
            }).catch(err => {
                console.error('Error al copiar:', err);
                showCopyFeedbackPopup('Error al copiar el valor.', true);
            });
        });

        buttonContainer.appendChild(button);
        parentContainer.appendChild(buttonContainer);
    }

    async function fetchIndicadorValor(indicador, fechaApi) {
        if (indicador.toLowerCase() === 'peso') {
            return { valor: 1, unidad_medida: 'Pesos', codigo: 'clp' };
        }
        const url = `${API_BASE_URL}/${indicador}/${fechaApi}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: `Error HTTP: ${response.status}` }));
                 throw new Error(errorData.message || `Error HTTP: ${response.status}`);
            }
            const data = await response.json();
            if (data.serie && data.serie.length > 0) {
                return { valor: data.serie[0].valor, unidad_medida: data.unidad_medida, codigo: data.codigo };
            }
            throw new Error(`No se encontraron datos para ${indicador.toUpperCase()} en la fecha solicitada.`);
        } catch (error) {
            console.error(`Error obteniendo ${indicador}:`, error);
            throw error;
        }
    }
    
    // --- Lógica Calculadora de Conversión ---
    conversionForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        showLoading();
        // Limpiar el área de resultado al inicio de una nueva conversión
        conversionResultadoDiv.innerHTML = ''; 

        const origen = origenIndicadorSelect.value;
        const destino = destinoIndicadorSelect.value;
        const cantidad = parseFloat(cantidadConvertirInput.value);
        const fecha = fechaConversionInput.value;
        const fechaApi = formatDateForAPI(fecha);

        if (isNaN(cantidad) || cantidad < 0) {
            displayMessage(conversionResultadoDiv, 'Por favor, ingrese una cantidad válida.', 'error');
            hideLoading();
            return;
        }
        if (!fecha) {
            displayMessage(conversionResultadoDiv, 'Por favor, seleccione una fecha.', 'error');
            hideLoading();
            return;
        }
        if (origen === destino) {
            displayMessage(conversionResultadoDiv, 'La moneda de origen y destino no pueden ser la misma.', 'info');
            hideLoading();
            return;
        }

        try {
            let valorOrigenData, valorDestinoData;
            
            if (origen.toLowerCase() !== 'peso') {
                valorOrigenData = await fetchIndicadorValor(origen, fechaApi);
            } else {
                valorOrigenData = { valor: 1, unidad_medida: 'Pesos', codigo: 'clp' };
            }

            if (destino.toLowerCase() !== 'peso') {
                valorDestinoData = await fetchIndicadorValor(destino, fechaApi);
            } else {
                valorDestinoData = { valor: 1, unidad_medida: 'Pesos', codigo: 'clp' };
            }
           
            const valorOrigenEnPesos = valorOrigenData.valor;
            const valorDestinoEnPesos = valorDestinoData.valor;

            let resultadoConversion;
            if (valorDestinoEnPesos === 0) {
                 displayMessage(conversionResultadoDiv, `El valor del indicador de destino (${destino.toUpperCase()}) es cero en la fecha seleccionada, no se puede convertir.`, 'error');
                 hideLoading(); return;
            }
            resultadoConversion = (cantidad * valorOrigenEnPesos) / valorDestinoEnPesos;
            
            const origenDisplay = origen.toLowerCase() === 'peso' ? 'Pesos Chilenos' : origen.toUpperCase();
            const destinoDisplay = destino.toLowerCase() === 'peso' ? 'Pesos Chilenos' : destino.toUpperCase();
            
            const cantidadFormateada = formatNumber_esCL(cantidad, (origen.toLowerCase() === 'peso' ? 0 : 2), (origen.toLowerCase() === 'peso' ? 0 : 2));
            const resultadoFormateado = formatNumber_esCL(resultadoConversion, 2, 5);
            
            const p = document.createElement('p');
            p.className = 'success';
            p.innerHTML = `${cantidadFormateada} ${origenDisplay} equivalen a <strong>${resultadoFormateado} ${destinoDisplay}</strong> <br>(fecha: ${fechaApi}).`;
            
            conversionResultadoDiv.appendChild(p); // Añadir primero el texto del resultado
            createCopyButton(resultadoConversion, conversionResultadoDiv); // Luego añadir el botón de copiar

        } catch (error) {
            if (error.message.includes("No se encontraron datos")) {
                 displayMessage(conversionResultadoDiv, error.message, 'error');
            } else {
                 displayMessage(conversionResultadoDiv, `Error al realizar la conversión. Verifique la fecha e inténtelo de nuevo. (${error.message})`, 'error');
            }
        } finally {
            hideLoading();
        }
    });
});