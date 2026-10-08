const USER = 'antoniolozbez';
const DOMAIN = 'gmail.com';
// Gmail delivers user+tag@ to user@: the "To" header shows which mail came from here.
// The tag is in the markup (copy, mailto) but hidden, so the page shows the plain address
const TAG = 'hoard';

export function MailLink() {
    return (
        <a href={`mailto:${USER}+${TAG}@${DOMAIN}`}>
            {USER}
            <span aria-hidden="true" className="visually-hidden">{`+${TAG}`}</span>
            {`@${DOMAIN}`}
        </a>
    );
}
