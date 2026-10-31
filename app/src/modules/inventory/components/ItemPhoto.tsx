import { SinglePhoto } from '@/ui/SinglePhoto';
import { itemPhoto, useInventory } from '../store';

export function ItemPhoto({ itemId, name }: { itemId: string; name: string }) {
  const attachments = useInventory((s) => s.attachments);
  const setItemPhoto = useInventory((s) => s.setItemPhoto);
  const removeItemPhoto = useInventory((s) => s.removeItemPhoto);
  return (
    <SinglePhoto
      photo={itemPhoto(attachments, itemId)}
      alt={name}
      onSet={(image) => setItemPhoto(itemId, image)}
      onRemove={() => removeItemPhoto(itemId)}
    />
  );
}
