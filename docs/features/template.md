# Feature Template

> Copy this template for each new feature prompt

## 🎯 Feature Name
**[Feature Title Here]**

## 📋 Objective
What does this feature accomplish? Why do users need it?

## 🔧 Requirements

### Functional Requirements
- [ ] Requirement 1
- [ ] Requirement 2  
- [ ] Requirement 3

### Non-Functional Requirements
- [ ] Performance expectations
- [ ] Security considerations
- [ ] Accessibility needs

## 🛠 Technical Implementation

### Backend (tRPC)
```typescript
// Example API endpoints needed
router.user.create.mutate()
router.user.getById.query()
```

### Frontend (React)
```typescript
// Example components needed
<UserForm />
<UserList />
<UserProfile />
```

### Database Schema
```sql
-- If you add a database later
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🎨 UI/UX Components
- **New shadcn/ui components needed:**
  - `pnpm dlx shadcn@latest add form input dialog`
- **Pages to create:**
  - `/src/app/feature/page.tsx`
- **Styling considerations:**
  - Mobile responsive
  - Dark mode support

## 📡 Supabase Integration  
- **Storage buckets needed:** `feature-files`
- **File upload requirements:** Max 10MB, PDF/images only
- **Public URL access:** Required for sharing

## 🚀 Deployment
- **Environment variables:** `FEATURE_API_KEY=xxx`
- **Railway configuration:** Add to `railway.json`

## ✅ Acceptance Criteria
- [ ] User can perform action X
- [ ] UI responds within 2 seconds  
- [ ] Mobile layout works correctly
- [ ] Error handling shows helpful messages

## 🔗 Related Features
- Links to other features this depends on or affects

---

**Next Steps After Completion:**
1. Test feature thoroughly
2. Update documentation
3. Deploy to production
4. Monitor usage analytics