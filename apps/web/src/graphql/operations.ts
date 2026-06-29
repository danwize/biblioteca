export const LIST_COPIES = `
  query ListCopies {
    physicalCopies {
      id
      workId
      title
      primaryAuthor
      isbn13
      publisher
      publishedDate
      pageCount
      copyNumber
      status
      owned
    }
  }
`

export const LOOKUP_BOOK = `
  query LookupBook($isbn: String!) {
    lookupBookByIsbn(isbn: $isbn) {
      title
      subtitle
      authors
      isbn13
      isbn10
      publisher
      publishedDate
      pageCount
      subjects
    }
  }
`

export const START_IMPORT = `
  mutation StartImport($input: StartImportSessionInput!) {
    startImportSession(input: $input) {
      id
      status
      scannedIsbn
      detectedTitle
    }
  }
`

export const CONFIRM_IMPORT = `
  mutation ConfirmImport($importSessionId: UUID, $input: ConfirmBookImportInput!) {
    confirmBookImport(importSessionId: $importSessionId, input: $input) {
      id
      title
      primaryAuthor
      isbn13
      publisher
      publishedDate
      pageCount
      copyNumber
      status
      owned
    }
  }
`
