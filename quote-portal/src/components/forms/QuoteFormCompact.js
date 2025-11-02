// Legacy compact quote form retained for reference; DynamicFormRenderer powers the live experience
// Safe to remove once audits confirm no integrations render this component dynamically

// Compact Quote Form - Modular multi-step form with validation and file upload
import { useI18n, statusLabel, procLabel, materialLabel, finishLabel } from '../../../shared/i18n.js'
import API from '../../../shared/lib/api.js'
import { uid } from '../../../shared/lib/utils.js'
import Field from '../Field.js'
import Modal from '../Modal.js'
import { validateQuoteForm, getStepFields, stepHasErrors, computeMissingFields, sanitizeInteger, sanitizeNumber } from './FormValidation.js'
import { handleFileUpload, handleProductFileUpload, removeFile, FilePreview } from './FileUploadUtils.js'
import { StepNavigation, StepHeader, StepProgress, StepButtons, getStepConfig } from './FormSteps.js'

const { useState, useEffect, useRef } = React

export default function QuoteFormCompact({ t, showNotification }) {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [popup, setPopup] = useState(null)
  const [errors, setErrors] = useState({})
  const [files, setFiles] = useState([])
  const [prodFiles, setProdFiles] = useState([])
  
  // Stepper state
  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [missingHighlight, setMissingHighlight] = useState(new Set())
  const stepRefs = useRef([])
  
  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '', phoneCode: '+90', phoneLocal: '', 
    country: 'TR', city: '', proj: '', process: [], material: '', grade: '', 
    thickness: '', qty: '', dims: '', dimsL: '', dimsW: '', dimsH: '', 
    tolerance: '', toleranceStd: 'ISO 2768-m', toleranceCrit: '', finish: '', 
    finishRal: '', anodizeType: '', due: '', repeat: 'one', budget: '', 
    budgetCurrency: 'TRY', budgetAmount: '', address: '', drawing: 'no', 
    productPics: 'no', desc: '', bendCount: '', weldMethod: '', surfaceRa: '', 
    qtyT1: '', qtyT2: '', qtyT3: ''
  })

  // Focus management
  function stepRef(ix) { 
    return (el) => { if (el) stepRefs.current[ix] = el } 
  }
  
  useEffect(() => {
    const el = stepRefs.current[step]
    if (el && typeof el.focus === 'function') {
      setTimeout(() => { try { el.focus() } catch {} }, 0)
    }
  }, [step])

  // Form helpers
  function setF(k, v) { setForm((s) => ({ ...s, [k]: v })) }
  function setInt(k, val) { setF(k, sanitizeInteger(val)) }
  function setNum(k, val) { setF(k, sanitizeNumber(val)) }
  
  function setPhoneLocal(val) {
    const clean = sanitizeInteger(val)
    setF('phoneLocal', clean)
    setF('phone', form.phoneCode + clean)
  }

  // Validation
  function validate() {
    const newErrors = validateQuoteForm(form, t)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Step navigation
  function goNext() {
    if (validate()) {
      const nextStep = Math.min(step + 1, getStepConfig(t).length - 1)
      setStep(nextStep)
      setFurthest(Math.max(furthest, nextStep))
    } else {
      setMissingHighlight(computeMissingFields(form))
    }
  }

  function goBack() {
    setStep(Math.max(step - 1, 0))
  }

  function goToStep(targetStep) {
    if (targetStep <= furthest) {
      setStep(targetStep)
    }
  }

  // File handling
  async function onFilesChanged(fileList) {
    const result = await handleFileUpload(fileList, files, 10, showNotification)
    setFiles(result.files)
  }

  async function onProdFilesChanged(fileList) {
    const result = await handleProductFileUpload(fileList, prodFiles, showNotification)
    setProdFiles(result.files)
  }

  function removeFileAt(index) {
    setFiles(removeFile(files, index))
  }

  function removeProdFileAt(index) {
    setProdFiles(removeFile(prodFiles, index))
  }

  // Form submission
  async function actualSubmit() {
    if (!validate()) {
      setMissingHighlight(computeMissingFields(form))
      showNotification('Lütfen tüm zorunlu alanları doldurun', 'error')
      return
    }

    setSubmitting(true)
    try {
      const qtyTiers = [form.qtyT1, form.qtyT2, form.qtyT3]
        .map(x => Number(x || 0))
        .filter(Boolean)

      const payload = {
        ...form,
        id: uid(),
        files: files.length > 0 ? files : undefined,
        prodFiles: prodFiles.length > 0 ? prodFiles : undefined,
        qtyTiers: qtyTiers.length > 0 ? qtyTiers : undefined
      }

      const result = await API.create(payload)
      
      if (result.success) {
        setMessage('Teklif talebiniz başarıyla gönderildi! En kısa sürede sizinle iletişime geçeceğiz.')
        setPopup('success')
        
        // Reset form
        setForm({
          name: '', company: '', email: '', phone: '', phoneCode: '+90', phoneLocal: '', 
          country: 'TR', city: '', proj: '', process: [], material: '', grade: '', 
          thickness: '', qty: '', dims: '', dimsL: '', dimsW: '', dimsH: '', 
          tolerance: '', toleranceStd: 'ISO 2768-m', toleranceCrit: '', finish: '', 
          finishRal: '', anodizeType: '', due: '', repeat: 'one', budget: '', 
          budgetCurrency: 'TRY', budgetAmount: '', address: '', drawing: 'no', 
          productPics: 'no', desc: '', bendCount: '', weldMethod: '', surfaceRa: '', 
          qtyT1: '', qtyT2: '', qtyT3: ''
        })
        setFiles([])
        setProdFiles([])
        setStep(0)
        setFurthest(0)
        setErrors({})
      } else {
        throw new Error(result.error || 'Bilinmeyen hata')
      }
    } catch (error) {
      console.error('Submit error:', error)
      setMessage('Gönderim sırasında bir hata oluştu. Lütfen tekrar deneyin.')
      setPopup('error')
    } finally {
      setSubmitting(false)
    }
  }

  const stepConfigs = getStepConfig(t)
  const currentStepConfig = stepConfigs[step]

  return React.createElement('div', { className: 'quote-form' },
    React.createElement(StepProgress, { 
      currentStep: step, 
      totalSteps: stepConfigs.length 
    }),

    React.createElement(StepNavigation, {
      currentStep: step,
      totalSteps: stepConfigs.length,
      onStepChange: goToStep,
      stepHasErrors: (stepIndex) => stepHasErrors(stepIndex, errors),
      furthest
    }),

    React.createElement(StepHeader, {
      step,
      title: currentStepConfig.title,
      description: currentStepConfig.description
    }),

    // Step content
    React.createElement('form', { 
      className: 'form-content',
      onSubmit: (e) => { e.preventDefault(); actualSubmit() }
    },
      // Step 0: Contact Information
      step === 0 && React.createElement('div', { className: 'step-content', ref: stepRef(0) },
        React.createElement(Field, {
          label: t.f_name, required: true, error: errors.name,
          value: form.name, onChange: (v) => setF('name', v)
        }),
        React.createElement(Field, {
          label: t.f_company, value: form.company, onChange: (v) => setF('company', v)
        }),
        React.createElement(Field, {
          label: t.f_email, type: 'email', required: true, error: errors.email,
          value: form.email, onChange: (v) => setF('email', v)
        }),
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_country, type: 'select', value: form.country,
              onChange: (v) => setF('country', v),
              options: [
                { value: 'TR', label: 'Türkiye' },
                { value: 'DE', label: 'Almanya' },
                { value: 'FR', label: 'Fransa' },
                { value: 'GB', label: 'İngiltere' },
                { value: 'US', label: 'Amerika' }
              ]
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_phone, required: true, error: errors.phone,
              value: form.phoneLocal, onChange: setPhoneLocal,
              placeholder: '5XX XXX XX XX'
            })
          )
        ),
        React.createElement(Field, {
          label: t.f_city, value: form.city, onChange: (v) => setF('city', v)
        })
      ),

      // Step 1: Project Details
      step === 1 && React.createElement('div', { className: 'step-content', ref: stepRef(1) },
        React.createElement(Field, {
          label: t.f_proj, required: true, error: errors.proj,
          value: form.proj, onChange: (v) => setF('proj', v),
          placeholder: 'Proje adını kısaca açıklayın'
        }),
        React.createElement(Field, {
          label: t.f_process, type: 'multi-select', required: true, error: errors.process,
          value: form.process, onChange: (v) => setF('process', v),
          options: [
            { value: 'laser', label: 'Lazer Kesim' },
            { value: 'cnc', label: 'CNC İşleme' },
            { value: 'bending', label: 'Bükme' },
            { value: 'welding', label: 'Kaynak' },
            { value: 'machining', label: 'Talaşlı İmalat' }
          ]
        }),
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_material, type: 'select', required: true, error: errors.material,
              value: form.material, onChange: (v) => setF('material', v),
              options: [
                { value: 'steel', label: 'Çelik' },
                { value: 'aluminum', label: 'Alüminyum' },
                { value: 'stainless', label: 'Paslanmaz Çelik' },
                { value: 'brass', label: 'Pirinç' },
                { value: 'copper', label: 'Bakır' }
              ]
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_grade, value: form.grade, onChange: (v) => setF('grade', v),
              placeholder: 'Malzeme kalitesi/sınıfı'
            })
          )
        )
      ),

      // Step 2: Technical Specifications
      step === 2 && React.createElement('div', { className: 'step-content', ref: stepRef(2) },
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_thickness, value: form.thickness, onChange: (v) => setNum('thickness', v),
              placeholder: 'mm', type: 'number'
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_qty, required: true, error: errors.qty,
              value: form.qty, onChange: (v) => setInt('qty', v),
              placeholder: 'Adet', type: 'number'
            })
          )
        ),
        React.createElement(Field, {
          label: t.f_dims, error: errors.dims,
          value: form.dims, onChange: (v) => setF('dims', v),
          placeholder: 'Örn: 100x50x20 mm veya Ø25x100 mm'
        }),
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: 'Uzunluk (mm)', value: form.dimsL, onChange: (v) => setNum('dimsL', v),
              type: 'number'
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: 'Genişlik (mm)', value: form.dimsW, onChange: (v) => setNum('dimsW', v),
              type: 'number'
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: 'Yükseklik (mm)', value: form.dimsH, onChange: (v) => setNum('dimsH', v),
              type: 'number'
            })
          )
        )
      ),

      // Step 3: Additional Details  
      step === 3 && React.createElement('div', { className: 'step-content', ref: stepRef(3) },
        React.createElement(Field, {
          label: t.f_finish, type: 'select', value: form.finish,
          onChange: (v) => setF('finish', v),
          options: [
            { value: '', label: 'Seçiniz...' },
            { value: 'none', label: 'Yüzey işlemi yok' },
            { value: 'painting', label: 'Boyama' },

            { value: 'galvanizing', label: 'Galvanizleme' }
          ]
        }),
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_repeat, type: 'select', value: form.repeat,
              onChange: (v) => setF('repeat', v),
              options: [
                { value: 'one', label: 'Tek seferlik' },
                { value: 'monthly', label: 'Aylık tekrar' },
                { value: 'quarterly', label: '3 aylık tekrar' },
                { value: 'yearly', label: 'Yıllık tekrar' }
              ]
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_due, type: 'date', value: form.due,
              onChange: (v) => setF('due', v)
            })
          )
        )
      ),

      // Step 4: Budget and Files
      step === 4 && React.createElement('div', { className: 'step-content', ref: stepRef(4) },
        React.createElement('div', { className: 'row' },
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_budget_currency, type: 'select', value: form.budgetCurrency,
              onChange: (v) => setF('budgetCurrency', v),
              options: [
                { value: 'TRY', label: 'Türk Lirası (₺)' },
                { value: 'USD', label: 'Amerikan Doları ($)' },
                { value: 'EUR', label: 'Euro (€)' }
              ]
            })
          ),
          React.createElement('div', { className: 'col' },
            React.createElement(Field, {
              label: t.f_budget_amount, type: 'number', error: errors.budgetAmount,
              value: form.budgetAmount, onChange: (v) => setNum('budgetAmount', v),
              placeholder: 'Tahmini bütçe'
            })
          )
        ),
        
        // File uploads
        React.createElement('div', { className: 'file-section', style: { marginTop: '20px' } },
          React.createElement('h4', null, 'Teknik Dosyalar'),
          React.createElement('input', {
            type: 'file',
            multiple: true,
            accept: '.pdf,.dwg,.dxf,.step,.stp,.iges,.igs,.jpg,.jpeg,.png',
            onChange: (e) => onFilesChanged(Array.from(e.target.files)),
            style: { marginBottom: '10px' }
          }),
          files.length > 0 && React.createElement('div', { className: 'file-list' },
            ...files.map((file, index) =>
              React.createElement(FilePreview, {
                key: index,
                file,
                index,
                onRemove: removeFileAt,
                showNotification
              })
            )
          )
        ),

        React.createElement(Field, {
          label: t.f_desc, type: 'textarea', rows: 4,
          value: form.desc, onChange: (v) => setF('desc', v),
          placeholder: 'Proje hakkında ek bilgiler, özel istekler...'
        })
      )
    ),

    React.createElement(StepButtons, {
      currentStep: step,
      totalSteps: stepConfigs.length,
      onNext: goNext,
      onPrevious: goBack,
      onSubmit: actualSubmit,
      submitting,
      canProceed: true,
      nextLabel: t.btn_next || 'İleri',
      prevLabel: t.btn_prev || 'Geri',
      submitLabel: t.btn_submit || 'Teklif Gönder'
    }),

    // Success/Error popup
    popup && React.createElement(Modal, {
      isOpen: true,
      onClose: () => setPopup(null),
      title: popup === 'success' ? 'Başarılı!' : 'Hata!',
      content: message,
      type: popup
    })
  )
}
