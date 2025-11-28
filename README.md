# 🏭 BeePlan MES (Manufacturing Execution System)

## Production Planning & Execution System

**Status:** 🔄 Active Development  
**Database:** PostgreSQL (19-table optimized architecture)  
**Progress:** 27/60 API Endpoints Migrated (45%)

---

## 📊 Current Project Status

### ✅ Completed Phases

**PHASE 1: Core Master Data (19 endpoints)** ✅ COMPLETE
- Operations, Workers, Stations, Skills, Substations
- Work Orders CRUD
- Key-based skills reference system

**PHASE 2: Production Core (13/25 endpoints)** 🔄 IN PROGRESS
- ✅ Production Plans CRUD with Enhanced Launch Algorithm
- ✅ Database-level concurrent launch prevention
- ✅ Shift-aware worker scheduling
- ✅ Queue management system
- ⏳ Worker Assignments (Next)

### 📚 Documentation

- **[MES-API-MIGRATION-GUIDE.md](./MES-API-MIGRATION-GUIDE.md)** - Complete API migration roadmap
- **[COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md](./COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md)** - Production Plans implementation details
- **[MES-COMPLETE-MIGRATION-GUIDE.md](./MES-COMPLETE-MIGRATION-GUIDE.md)** - Comprehensive migration guide
- **[PHASE-1-2-IMPLEMENTATION-GUIDE.md](./PHASE-1-2-IMPLEMENTATION-GUIDE.md)** - Schema & workflow guide

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

**Last Updated:** 20 Kasım 2025  
**Version:** 2.0 - PostgreSQL Migration In Progress