# Firestore Security & Index Notes

## Recommended Security Rules

Deploy the following baseline rules after verifying they match your production access patterns:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /quotes/{quoteId} {
      allow read: if request.auth != null;
      allow create, update, delete: if request.auth != null && request.auth.token.role in ['admin'];
    }

    match /users/{email} {
      allow read, update, delete: if request.auth != null && request.auth.token.email == email;
      allow list: if request.auth != null && request.auth.token.role == 'admin';
      allow create: if request.auth != null && request.auth.token.role == 'admin';
    }

    match /sessions/{token} {
      allow read, write: if request.auth != null && request.auth.token.email != null;
    }

    match /settings/{docId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.role == 'admin';
    }

    match /system/{docId} {
      allow read, write: if request.auth != null && request.auth.token.role == 'admin';
    }
  }
}
```

Adjust the `request.auth.token` checks to align with your authentication provider (Firebase Auth, custom claims, etc.). For public quote submission, proxy writes through the backend API instead of exposing direct client access.

## Suggested Composite Indexes

Create these indexes in Firestore to keep the most common admin queries performant:

| Collection | Fields | Query Usage |
|------------|--------|-------------|
| `quotes` | `status ASC`, `createdAt DESC` | Admin dashboard filtering by status with recent-first ordering |
| `quotes` | `needsPriceUpdate ASC`, `createdAt DESC` | Bulk price update queue |
| `quotes` | `proj ASC`, `createdAt DESC` | Project-specific searches |
| `users` | `active ASC`, `createdAt DESC` | Listing active/inactive admins |

Generate each composite index through the Firebase Console or via `firebase firestore:indexes` in your deployment pipeline.

## Deployment Checklist Additions

- [ ] Run `npm run test:smoke` before deploying to ensure Firestore CRUD access is healthy.
- [ ] Confirm `serviceAccountKey.json` matches the target Firebase project.
- [ ] Re-deploy security rules via `firebase deploy --only firestore:rules` after any changes.
- [ ] Document new indexes in the team wiki and keep the exported `firestore.indexes.json` checked into the repo.

```