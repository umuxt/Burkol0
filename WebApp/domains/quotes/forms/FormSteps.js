// Form Steps - Step navigation and progress management
import React from 'react';

export function StepNavigation({ currentStep, totalSteps, onStepChange, stepHasErrors, furthest }) {
  
  return React.createElement('div', { 
    className: 'step-navigation',
    style: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      margin: '20px 0',
      flexWrap: 'wrap',
      gap: '8px'
    }
  },
    Array.from({ length: totalSteps }, (_, index) => {
      const isActive = index === currentStep
      const isCompleted = index <= furthest
      const hasErrors = stepHasErrors(index)
      const isClickable = index <= furthest
      
      return React.createElement('div', {
        key: index,
        onClick: isClickable ? () => onStepChange(index) : undefined,
        style: {
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isClickable ? 'pointer' : 'default',
          backgroundColor: isActive ? '#007bff' : 
                          hasErrors ? '#dc3545' :
                          isCompleted ? '#28a745' : '#e9ecef',
          color: isActive || isCompleted ? 'white' : '#6c757d',
          fontWeight: 'bold',
          fontSize: '14px',
          border: hasErrors ? '2px solid #dc3545' : '2px solid transparent',
          transition: 'all 0.2s ease'
        }
      }, index + 1)
    })
  )
}

export function StepHeader({ step, title, description }) {
  
  return React.createElement('div', { 
    className: 'step-header',
    style: {
      textAlign: 'center',
      marginBottom: '30px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px'
    }
  },
    React.createElement('h2', { 
      style: { 
        margin: '0 0 8px 0',
        color: '#333',
        fontSize: '24px'
      } 
    }, title),
    description && React.createElement('p', { 
      style: { 
        margin: 0,
        color: '#666',
        fontSize: '16px'
      } 
    }, description)
  )
}

export function StepProgress({ currentStep, totalSteps }) {
  const progress = ((currentStep + 1) / totalSteps) * 100
  
  return React.createElement('div', { 
    className: 'step-progress',
    style: {
      width: '100%',
      height: '6px',
      backgroundColor: '#e9ecef',
      borderRadius: '3px',
      overflow: 'hidden',
      marginBottom: '20px'
    }
  },
    React.createElement('div', {
      style: {
        width: `${progress}%`,
        height: '100%',
        backgroundColor: '#007bff',
        transition: 'width 0.3s ease'
      }
    })
  )
}

export function StepButtons({ 
  currentStep, 
  totalSteps, 
  onNext, 
  onPrevious, 
  onSubmit, 
  submitting, 
  canProceed = true,
  nextLabel = 'İleri',
  prevLabel = 'Geri',
  submitLabel = 'Gönder'
}) {
  const isLastStep = currentStep === totalSteps - 1
  
  return React.createElement('div', { 
    className: 'step-buttons',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '30px',
      padding: '20px 0'
    }
  },
    React.createElement('div', null,
      currentStep > 0 && React.createElement('button', {
        type: 'button',
        onClick: onPrevious,
        disabled: submitting,
        className: 'btn btn-secondary',
        style: {
          padding: '10px 20px',
          fontSize: '16px'
        }
      }, prevLabel)
    ),
    
    React.createElement('div', null,
      !isLastStep && React.createElement('button', {
        type: 'button',
        onClick: onNext,
        disabled: !canProceed || submitting,
        className: 'btn btn-primary',
        style: {
          padding: '10px 20px',
          fontSize: '16px'
        }
      }, nextLabel),
      
      isLastStep && React.createElement('button', {
        type: 'button',
        onClick: onSubmit,
        disabled: !canProceed || submitting,
        className: 'btn btn-success',
        style: {
          padding: '12px 30px',
          fontSize: '18px',
          fontWeight: 'bold'
        }
      }, submitting ? 'Gönderiliyor...' : submitLabel)
    )
  )
}

export function getStepConfig(t) {
  return [
    {
      title: t.step1_title || 'İletişim Bilgileri',
      description: t.step1_desc || 'Size ulaşabilmemiz için gerekli bilgiler'
    },
    {
      title: t.step2_title || 'Proje Detayları',
      description: t.step2_desc || 'Projeniz hakkında temel bilgiler'
    },
    {
      title: t.step3_title || 'Teknik Özellikler',
      description: t.step3_desc || 'Üretim için gerekli teknik detaylar'
    },
    {
      title: t.step4_title || 'Ek Detaylar',
      description: t.step4_desc || 'Yüzey işlemleri ve özel gereksinimler'
    },
    {
      title: t.step5_title || 'Bütçe ve Dosyalar',
      description: t.step5_desc || 'Bütçe bilgileri ve teknik dosyalar'
    }
  ]
}