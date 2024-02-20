import {type CurrentUser} from '@sanity/types'
import {BoundaryElementProvider, Flex, Stack} from '@sanity/ui'
import {forwardRef, memo, useCallback, useImperativeHandle, useMemo, useState} from 'react'
import {type UserListWithPermissionsHookValue} from 'sanity'

import {type CommentsSelectedPath} from '../../context'
import {
  type CommentCreatePayload,
  type CommentEditPayload,
  type CommentReactionOption,
  type CommentStatus,
  type CommentsUIMode,
  type CommentThreadItem,
} from '../../types'
import {CommentsListItem} from './CommentsListItem'
import {CommentsListStatus} from './CommentsListStatus'
import {CommentThreadLayout} from './CommentThreadLayout'

const SCROLL_INTO_VIEW_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'start',
  inline: 'nearest',
}

interface GroupedComments {
  [field: string]: CommentThreadItem[]
}

function groupThreads(comments: CommentThreadItem[]) {
  return comments.reduce((acc, comment) => {
    const field = comment.fieldPath

    if (!acc[field]) {
      acc[field] = []
    }

    acc[field].push(comment)

    return acc
  }, {} as GroupedComments)
}

/**
 * @beta
 * @hidden
 */
export interface CommentsListProps {
  beforeListNode?: React.ReactNode
  comments: CommentThreadItem[]
  currentUser: CurrentUser
  error: Error | null
  loading: boolean
  mentionOptions: UserListWithPermissionsHookValue
  mode: CommentsUIMode
  onCopyLink?: (id: string) => void
  onCreateRetry: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, payload: CommentEditPayload) => void
  onNewThreadCreate: (payload: CommentCreatePayload) => void
  onPathSelect?: (nextPath: CommentsSelectedPath) => void
  onReactionSelect?: (id: string, reaction: CommentReactionOption) => void
  onReply: (payload: CommentCreatePayload) => void
  onStatusChange?: (id: string, status: CommentStatus) => void
  readOnly?: boolean
  selectedPath: CommentsSelectedPath | null
  status: CommentStatus
}

/**
 * @beta
 * @hidden
 */
export interface CommentsListHandle {
  scrollToComment: (id: string) => void
}

const CommentsListInner = forwardRef<CommentsListHandle, CommentsListProps>(
  function CommentsListInner(props: CommentsListProps, ref) {
    const {
      beforeListNode,
      comments,
      currentUser,
      error,
      loading,
      mentionOptions,
      mode,
      onCopyLink,
      onCreateRetry,
      onDelete,
      onEdit,
      onNewThreadCreate,
      onPathSelect,
      onReactionSelect,
      onReply,
      onStatusChange,
      readOnly,
      selectedPath,
      status,
    } = props
    const [boundaryElement, setBoundaryElement] = useState<HTMLDivElement | null>(null)

    const scrollToComment = useCallback((id: string) => {
      const commentElement = document?.querySelector(`[data-comment-id="${id}"]`)

      if (commentElement) {
        commentElement.scrollIntoView(SCROLL_INTO_VIEW_OPTIONS)
      }
    }, [])

    useImperativeHandle(
      ref,
      () => {
        return {
          scrollToComment,
        }
      },
      [scrollToComment],
    )

    const groupedThreads = useMemo(() => Object.entries(groupThreads(comments)), [comments])

    const showComments = !loading && !error && groupedThreads.length > 0

    return (
      <Flex
        direction="column"
        flex={1}
        height="fill"
        overflow="hidden"
        ref={setBoundaryElement}
        sizing="border"
      >
        {mode !== 'upsell' && (
          <CommentsListStatus
            error={error}
            hasNoComments={groupedThreads.length === 0}
            loading={loading}
            status={status}
          />
        )}

        {(showComments || beforeListNode) && (
          <Stack
            as="ul"
            flex={1}
            overflow="auto"
            padding={3}
            paddingTop={1}
            paddingBottom={6}
            sizing="border"
            space={1}
          >
            {beforeListNode}
            <BoundaryElementProvider element={boundaryElement}>
              {groupedThreads?.map(([fieldPath, group]) => {
                // Since all threads in the group point to the same field, the breadcrumbs will be
                // the same for all of them. Therefore, we can just pick the first one.
                const breadcrumbs = group[0].breadcrumbs

                // The thread ID is used to scroll to the thread.
                // We pick the first thread id in the group so that we scroll to the first thread
                // in the group.
                const firstThreadId = group[0].threadId

                // The new thread is selected if the field path matches the selected path and
                // there is no thread ID selected.
                const newThreadSelected =
                  selectedPath?.fieldPath === fieldPath && !selectedPath.threadId

                return (
                  <Stack as="li" key={fieldPath} data-group-id={firstThreadId} paddingTop={3}>
                    <CommentThreadLayout
                      mode={mode}
                      breadcrumbs={breadcrumbs}
                      canCreateNewThread={status === 'open'}
                      currentUser={currentUser}
                      fieldPath={fieldPath}
                      isSelected={newThreadSelected}
                      key={fieldPath}
                      mentionOptions={mentionOptions}
                      onNewThreadCreate={onNewThreadCreate}
                      onPathSelect={onPathSelect}
                      readOnly={readOnly}
                    >
                      {group.map((item) => {
                        // The default sort order is by date, descending (newest first).
                        // However, inside a thread, we want the order to be ascending (oldest first).
                        // So we reverse the array here.
                        // We use slice() to avoid mutating the original array.
                        const replies = item.replies.slice().reverse()

                        const canReply =
                          status === 'open' &&
                          item.parentComment._state?.type !== 'createError' &&
                          item.parentComment._state?.type !== 'createRetrying'

                        // The thread is selected if the thread ID and field path matches the
                        // selected path.
                        const threadIsSelected =
                          selectedPath?.threadId === item.parentComment.threadId &&
                          selectedPath?.fieldPath === item.parentComment.target.path.field

                        return (
                          <CommentsListItem
                            mode={mode}
                            canReply={canReply}
                            currentUser={currentUser}
                            isSelected={threadIsSelected}
                            key={item.parentComment._id}
                            mentionOptions={mentionOptions}
                            onCopyLink={onCopyLink}
                            onCreateRetry={onCreateRetry}
                            onDelete={onDelete}
                            onEdit={onEdit}
                            onPathSelect={onPathSelect}
                            onReactionSelect={onReactionSelect}
                            onReply={onReply}
                            onStatusChange={onStatusChange}
                            parentComment={item.parentComment}
                            readOnly={readOnly}
                            replies={replies}
                          />
                        )
                      })}
                    </CommentThreadLayout>
                  </Stack>
                )
              })}
            </BoundaryElementProvider>
          </Stack>
        )}
      </Flex>
    )
  },
)

/**
 * @beta
 * @hidden
 */
export const CommentsList = memo(CommentsListInner)
