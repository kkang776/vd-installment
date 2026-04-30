"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className={`relative bg-white w-full ${maxWidth} max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 text-gray-600 leading-relaxed whitespace-pre-wrap text-sm">
          {children}
        </div>
        
        <div className="p-6 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
