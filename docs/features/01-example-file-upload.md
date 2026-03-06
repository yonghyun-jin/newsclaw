# File Upload Feature

## 🎯 Feature Name
**Document Upload & Management System**

## 📋 Objective
Allow users to upload, organize, and share documents through Supabase storage with a clean, intuitive interface.

## 🔧 Requirements

### Functional Requirements
- [ ] Users can drag & drop files to upload
- [ ] Support PDF, DOC, images (max 10MB each)
- [ ] Display upload progress bar
- [ ] Generate shareable public links
- [ ] File organization with folders
- [ ] File deletion and renaming

### Non-Functional Requirements
- [ ] Upload progress within 3 seconds for 1MB files
- [ ] Secure file access with expiring URLs
- [ ] WCAG 2.1 AA accessibility compliance

## 🛠 Technical Implementation

### Backend (tRPC)
```typescript
// API endpoints needed
router.files.upload.mutate({ file: File, folder?: string })
router.files.list.query({ folder?: string })  
router.files.delete.mutate({ fileId: string })
router.files.getPublicUrl.query({ fileId: string })
```

### Frontend (React)
```typescript
// Components needed
<FileUploadZone />
<FileList />
<FileCard />
<FolderTree />
<ShareModal />
```

### Database Schema
```sql
-- File metadata tracking
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255),
  file_path TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  folder_path TEXT DEFAULT '/'
);
```

## 🎨 UI/UX Components
- **New shadcn/ui components needed:**
  - `pnpm dlx shadcn@latest add progress dialog toast`
- **Pages to create:**
  - `/src/app/files/page.tsx`
  - `/src/app/files/[folder]/page.tsx`
- **Styling considerations:**
  - Drag & drop visual feedback
  - File type icons
  - Mobile-friendly file browser

## 📡 Supabase Integration  
- **Storage buckets needed:** `user-documents`
- **File upload requirements:** 
  - Max 10MB per file
  - Allowed types: PDF, DOC, DOCX, JPG, PNG, GIF
- **Public URL access:** 24-hour expiring links for sharing
- **Folder structure:** `/{userId}/{folder}/{filename}`

## 🚀 Deployment
- **Environment variables:** 
  ```env
  SUPABASE_STORAGE_BUCKET=user-documents
  MAX_FILE_SIZE=10485760
  ```
- **Railway configuration:** Increase file upload limits

## ✅ Acceptance Criteria
- [ ] User can drag files into upload zone
- [ ] Progress bar shows real-time upload status
- [ ] Files appear in list immediately after upload
- [ ] Public sharing links work for 24 hours
- [ ] Mobile users can upload from camera/gallery
- [ ] Error messages guide users when file too large
- [ ] Folder creation and organization works

## 🔗 Related Features
- Authentication system (users need accounts)
- User dashboard (files section)

---

**Estimated Development Time:** 2-3 days
**Priority:** High (core functionality)