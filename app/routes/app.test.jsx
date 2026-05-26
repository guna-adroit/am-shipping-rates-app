//app.test.jsx
import { Form } from "react-router"
 export async function loader() {
    const response = await fetch("https://dummyjson.com/products");
    return response.json();
  }
  
export default function AdditionalPage() {
 
  return (
    <s-page heading="Test Page">
        <s-section slot="aside" heading="Testing">
            <Form method="post" data-save-bar
                onSubmit="console.log('submit');"
                onReset="console.log('reset');">
                <s-text-field label="Name" name="name"></s-text-field>
                <s-button type="submit">Submit</s-button>
                <s-button type="reset">Reset</s-button>
            </Form>
         
        </s-section>
      <s-section heading="Multiple pages">
        <s-paragraph>
          The app template comes with an additional page which demonstrates how
          to create multiple pages within app navigation using{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          To create your own page and have it show up in the app navigation, add
          a page inside <code>app/routes</code>, and a link to it in the{" "}
          <code>&lt;ui-nav-menu&gt;</code> component found in{" "}
          <code>app/routes/app.jsx</code>.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              App nav best practices
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
