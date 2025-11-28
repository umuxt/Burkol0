# 🏭 BeePlan MES (Manufacturing Execution System)

## Production Planning & Execution System

**Status:** 🔄 Active Development  
**Database:** PostgreSQL (19-table optimized architecture)  

---

## 📊 Current Project Status

### ✅ Completed Phases

**PHASE 1: Core Master Data** ✅ COMPLETE
- Operations, Workers, Stations, Skills, Substations
- Work Orders CRUD
- Key-based skills reference system

**PHASE 2: Production Core** 🔄 IN PROGRESS
- ✅ Production Plans CRUD with Enhanced Launch Algorithm
- ✅ Database-level concurrent launch prevention
- ✅ Shift-aware worker scheduling
- ✅ Queue management system
- ✅ FIFO Task Scheduling
- ✅ Lot Tracking System

### 📚 Documentation

- **[KULLANIM-KLAVUZU.md](./WebApp/docs/KULLANIM-KLAVUZU.md)** - User Guide (TR)
- **[TEKNIK-KLAVUZ.md](./WebApp/docs/TEKNIK-KLAVUZ.md)** - Technical Documentation & API Reference

### 🗄️ Database Migrations

**Completed:** Migrations 022-045  
**Key Features:**
- 19-table optimized schema
- FIFO inventory management
- Lot tracking system
- Real-time LISTEN/NOTIFY
- Enhanced worker assignments with sequence tracking

---

## 🚀 Quick Start

### Installation

```bash
cd WebApp
npm install
```

### Development

```bash
npm run dev
```

### Database Setup

```bash
# Run migrations
npm run migrate

# Rollback (if needed)
npm run migrate:rollback
```

---

## 🎯 Key Features

- **Production Planning:** Multi-node production plans with dependencies
- **Enhanced Launch:** Topological sort, shift-aware scheduling, queue management
- **Worker Management:** Skill-based matching, queue tracking, shift awareness
- **Inventory:** FIFO consumption, lot tracking, partial reservations
- **Real-time:** SSE notifications, live status updates
- **Concurrent Safety:** Database-level locks prevent conflicts

---

## 📖 Original Project

This project is based on Production Planning System UI.  
Original design: https://www.figma.com/design/LrmKaLaSnKWnrffkzVG6dV/Production-Planning-System-UI

---

**Last Updated:** 28 Kasım 2025  
**Version:** 2.1 - BeePlan Transformation