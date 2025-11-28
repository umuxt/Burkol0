import { useState, useEffect, useCallback } from 'react';

const useMaterialCategories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/material-categories');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setCategories(data);
        } catch (e) {
            setError(e);
            console.error("❌ Malzeme kategorileri yüklenirken hata:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const addCategory = async (name) => {
        try {
            const response = await fetch('/api/material-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const newCategory = await response.json();
            setCategories(prev => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
            return newCategory;
        } catch (e) {
            console.error("❌ Yeni kategori eklenirken hata:", e);
            throw e;
        }
    };

    const updateCategory = async (id, name) => {
        try {
            const response = await fetch(`/api/material-categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const updatedCategory = await response.json();
            setCategories(prev => prev.map(c => (c.id === id ? updatedCategory : c)).sort((a, b) => a.name.localeCompare(b.name)));
            return updatedCategory;
        } catch (e) {
            console.error("❌ Kategori güncellenirken hata:", e);
            throw e;
        }
    };

    const deleteCategory = async (id, { updateRemoved = false } = {}) => {
        try {
            const response = await fetch(`/api/material-categories/${id}?updateRemoved=${updateRemoved}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorMessage = await response.text();
                throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
            }
            
            setCategories(prev => prev.filter(c => c.id !== id));
            return true;

        } catch (e) {
            console.error("❌ Kategori silinirken hata:", e);
            throw e;
        }
    };

    const getCategoryUsage = async (id) => {
        try {
            const response = await fetch(`/api/material-categories/${id}/usage`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (e) {
            console.error("❌ Kategori kullanım durumu alınırken hata:", e);
            throw e;
        }
    };


    return { 
        categories, 
        loading, 
        error, 
        fetchCategories, 
        addCategory, 
        updateCategory, 
        deleteCategory,
        getCategoryUsage
    };
};

export default useMaterialCategories;
